"""Reject anything outside the pinned Primitive geometric SVG export."""
import json
import math
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

NS = '{http://www.w3.org/2000/svg}'
NUMBER = r'[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?'
ATTRS = {
    'svg': {'version', 'width', 'height'},
    'g': {'transform'},
    'rect': {'x', 'y', 'width', 'height', 'fill', 'fill-opacity'},
    'ellipse': {'cx', 'cy', 'rx', 'ry', 'fill', 'fill-opacity'},
    'circle': {'cx', 'cy', 'r', 'fill', 'fill-opacity'},
    'polygon': {'points', 'fill', 'fill-opacity'},
    'path': {'d', 'fill', 'stroke', 'stroke-opacity', 'stroke-width'},
}

def require(ok, message):
    if not ok:
        raise ValueError(message)

def number(value):
    require(re.fullmatch(NUMBER, value) is not None, 'Invalid numeric geometry')
    n = float(value)
    require(math.isfinite(n) and abs(n) <= 1000000, 'Nonfinite or excessive geometry')
    return n

def transform(value):
    cursor = 0
    count = 0
    for match in re.finditer(r'(scale|translate|rotate)\(([^()]*)\)', value):
        require(not value[cursor:match.start()].strip(), 'Unknown transform')
        values = re.split(r'[\s,]+', match.group(2).strip())
        allowed = (1, 3) if match.group(1) == 'rotate' else (1, 2)
        require(len(values) in allowed, 'Invalid transform arity')
        for v in values:
            number(v)
        cursor = match.end()
        count += 1
    require(0 < count <= 4 and not value[cursor:].strip(), 'Invalid transform')

def validate(data, shapes, output_size):
    require(0 < len(data) <= 1024*1024, 'SVG size exceeds bound')
    text = data.decode('utf-8', errors='strict')
    require('<!' not in text and '<?' not in text and 'xmlns:' not in text,
            'DTD, entities, processing instructions or extra namespaces forbidden')
    root = ET.fromstring(text)
    require(root.tag == NS+'svg', 'SVG namespace/root differs')
    require(root.attrib.get('version') == '1.1', 'SVG version differs')
    width, height = root.attrib.get('width', ''), root.attrib.get('height', '')
    require(width.isascii() and height.isascii() and width.isdecimal() and height.isdecimal(), 'Invalid SVG dimensions')
    width, height = int(width), int(height)
    require(1 <= width <= output_size and 1 <= height <= output_size <= 1024, 'SVG dimensions exceed bound')
    require(len(root) == 2 and root[0].tag == NS+'rect' and root[1].tag == NS+'g', 'Primitive export structure differs')
    bg = root[0].attrib
    require(bg.get('x') == '0' and bg.get('y') == '0' and bg.get('width') == str(width)
            and bg.get('height') == str(height), 'Background differs from dimensions')
    painted = 0
    elements = 0
    def visit(node, depth):
        nonlocal painted, elements
        elements += 1
        require(depth <= 4 and elements <= 2*shapes+3, 'SVG tree exceeds bound')
        require(node.tag.startswith(NS), 'Foreign namespace')
        tag = node.tag[len(NS):]
        require(tag in ATTRS and set(node.attrib) <= ATTRS[tag], 'Forbidden SVG tag or attribute')
        required = {
            'svg': {'version','width','height'}, 'g': {'transform'},
            'rect': {'x','y','width','height','fill'},
            'ellipse': {'cx','cy','rx','ry','fill'}, 'circle': {'cx','cy','r','fill'},
            'polygon': {'points','fill'}, 'path': {'d','fill','stroke','stroke-opacity','stroke-width'},
        }[tag]
        if node is not root[0] and tag in ('rect','ellipse','circle','polygon'):
            required |= {'fill-opacity'}
        require(required <= set(node.attrib), 'Required geometric attributes missing')
        require(not (node.text or '').strip() and not (node.tail or '').strip(), 'Text content forbidden')
        require(tag in ('svg','g') or len(node) == 0, 'Nested shapes forbidden')
        for key, value in node.attrib.items():
            require(len(value) <= 4096, 'Attribute size exceeds bound')
            if key in ('fill','stroke'):
                require(value == 'none' or re.fullmatch(r'#[a-fA-F0-9]{6}', value), 'Nonliteral paint forbidden')
            elif key in ('fill-opacity','stroke-opacity'):
                require(0 <= number(value) <= 1, 'Opacity out of bounds')
            elif key == 'transform':
                transform(value)
            elif key == 'points':
                # Triangle exports use spaced pairs; Polygon.SVG joins every
                # coordinate with commas. Accept both without empty separators.
                separator = r'(?:[ \t\r\n]+|[ \t\r\n]*,[ \t\r\n]*)'
                pattern = NUMBER + r'(?:' + separator + NUMBER + r')*'
                require(value.isascii() and re.fullmatch(pattern, value.strip()),
                        'Invalid polygon coordinates')
                coords = re.findall(NUMBER, value)
                require(6 <= len(coords) <= 64 and len(coords) % 2 == 0,
                        'Invalid polygon size')
                for c in coords:
                    number(c)
            elif key == 'd':
                pattern = r'\s*M\s+('+NUMBER+r')\s+('+NUMBER+r')\s+Q\s+('+NUMBER+r')\s+('+NUMBER+r')\s*,\s*('+NUMBER+r')\s+('+NUMBER+r')\s*'
                match = re.fullmatch(pattern, value)
                require(match is not None, 'Only Primitive M/Q paths accepted')
                for c in match.groups():
                    number(c)
            elif key != 'version':
                n = number(value)
                if key in ('width','height','rx','ry','r','stroke-width'):
                    require(n >= 0, 'Negative shape extent')
        if tag not in ('svg','g') and node is not root[0]:
            painted += 1
        for child in node:
            visit(child, depth+1)
    visit(root,1)
    require(painted == shapes, 'Shape count differs from completed request')
    return {'ok': True, 'width': width, 'height': height, 'shape_count': painted, 'elements': elements}

if __name__ == '__main__':
    try:
        require(len(sys.argv) == 4, 'Expected SVG file, shape count and output size')
        shapes, size = int(sys.argv[2]), int(sys.argv[3])
        require(1 <= shapes <= 200 and 64 <= size <= 1024, 'Checker parameters exceed bound')
        file = Path(sys.argv[1])
        require(file.is_file() and not file.is_symlink() and file.stat().st_size <= 1024*1024, 'Invalid SVG file')
        print(json.dumps(validate(file.read_bytes(), shapes, size)))
    except Exception as error:
        print(json.dumps({'ok': False, 'error': str(error)}))
        sys.exit(1)
