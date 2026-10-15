"""Closed checker for the pinned Threading monochrome advanced exporter."""
import hashlib
import json
import math
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path


def need(ok, message):
    if not ok:
        raise ValueError(message)


def number(value):
    need(isinstance(value, str) and len(value) <= 128, 'Number size/type invalid')
    need(re.fullmatch(r'-?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?', value) is not None, 'Number syntax invalid')
    result = float(value)
    need(math.isfinite(result), 'Nonfinite number')
    return result


try:
    need(len(sys.argv) == 3, 'SVG and parameters files required')
    svg_file, params_file = map(Path, sys.argv[1:])
    need(svg_file.is_file() and not svg_file.is_symlink(), 'Candidate type invalid')
    need(params_file.is_file() and not params_file.is_symlink() and params_file.stat().st_size <= 65536, 'Parameters type/size invalid')
    p = json.loads(params_file.read_text())
    fields = {'shape', 'pegs', 'quality', 'mode', 'invert_colors', 'lines', 'opacity', 'thickness', 'display_pegs', 'show_indicators', 'blur'}
    need(isinstance(p, dict) and set(p) == fields, 'Parameters fields invalid')
    for key, low, high, step in [('pegs', 150, 350, 10), ('lines', 500, 2500, 500), ('opacity', 1, 5, 1)]:
        need(type(p[key]) is int and low <= p[key] <= high and (p[key] - low) % step == 0, 'Parameters grid invalid: ' + key)
    need(type(p['shape']) is int and p['shape'] in (0, 1) and type(p['quality']) is int and p['quality'] == 1 and type(p['mode']) is int and p['mode'] == 0, 'Profile mode invalid')
    need(p['invert_colors'] is False and p['show_indicators'] is True and type(p['blur']) is int and p['blur'] == 0 and type(p['display_pegs']) is bool, 'Profile flags invalid')
    need(type(p['thickness']) in (int, float) and p['thickness'] in (0.25, 0.5, 0.75, 1), 'Thickness invalid')
    data = svg_file.read_bytes()
    need(0 < len(data) <= 1048576, 'SVG size exceeds bound')
    text = data.decode('utf-8', 'strict')
    declaration = '<?xml version="1.0" encoding="UTF-8" standalone="no"?>'
    need(text.startswith(declaration), 'XML declaration differs')
    rest = text[len(declaration):]
    need('<?' not in rest and '<!DOCTYPE' not in rest and '<!ENTITY' not in rest and '<!--' not in rest and 'xmlns:' not in rest, 'Forbidden XML construct')
    css = 'line{mix-blend-mode:difference;}'
    chunks = re.findall(r'<!\[CDATA\[(.*?)\]\]>', rest, re.S)
    need(len(chunks) == 1 and re.sub(r'\s', '', chunks[0]) == css, 'Only the fixed CSS CDATA is allowed')
    root = ET.fromstring(data)
    ns = '{http://www.w3.org/2000/svg}'
    need(root.tag == ns + 'svg' and root.attrib == {'version': '1.1', 'viewBox': '0 0 1000 1000'}, 'SVG root differs')
    expected = [ns + 'rect'] + ([ns + 'g'] if p['display_pegs'] else []) + [ns + 'defs', ns + 'g']
    need([e.tag for e in root] == expected, 'Native child order differs')
    bg, defs, thread = root[0], root[-2], root[-1]
    need(bg.attrib == {'fill': 'white', 'stroke': 'none', 'x': '-10', 'y': '-10', 'width': '1020', 'height': '1020'} and len(bg) == 0, 'Background differs')
    need(defs.attrib == {} and len(defs) == 1 and defs[0].tag == ns + 'style' and defs[0].attrib == {'type': 'text/css'} and len(defs[0]) == 0, 'Style structure differs')
    need(re.sub(r'\s', '', defs[0].text or '') == css, 'Fixed CSS differs')
    c = math.ceil(255 * (2 ** (p['opacity'] - 7)))
    need(set(thread.attrib) == {'stroke', 'stroke-width', 'stroke-linecap', 'fill'} and thread.get('stroke') == f'rgb({c}, {c}, {c})' and thread.get('stroke-linecap') == 'round' and thread.get('fill') == 'none' and number(thread.get('stroke-width')) == 10 * p['thickness'], 'Thread paint differs')
    need(len(thread) == p['lines'], 'Line count differs')
    for line in thread:
        need(line.tag == ns + 'line' and set(line.attrib) == {'x1', 'y1', 'x2', 'y2'} and len(line) == 0, 'Line shape differs')
        need(all(0 <= number(v) <= 1000 for v in line.attrib.values()), 'Line geometry differs')
    if p['display_pegs']:
        pegs = root[1]
        need(pegs.attrib == {'fill': 'red', 'stroke': 'none'} and len(pegs) == p['pegs'], 'Peg group differs')
        for circle in pegs:
            need(circle.tag == ns + 'circle' and set(circle.attrib) == {'cx', 'cy', 'r'} and len(circle) == 0, 'Peg shape differs')
            need(all(0 <= number(circle.get(k)) <= 1000 for k in ('cx', 'cy')) and number(circle.get('r')) == 2.5, 'Peg geometry differs')
    count = 0
    stack = [(root, 1)]
    while stack:
        element, depth = stack.pop()
        count += 1
        need(depth <= 4 and count <= 2856, 'XML depth/element bound exceeded')
        need(element is defs[0] or not (element.text or '').strip(), 'Unexpected text')
        need(not (element.tail or '').strip(), 'Unexpected tail')
        need(all(len(value) <= 128 for value in element.attrib.values()), 'Attribute exceeds bound')
        stack.extend((child, depth + 1) for child in element)
    print(json.dumps({'ok': True, 'svg_sha256': 'sha256:' + hashlib.sha256(data).hexdigest(), 'bytes': len(data), 'line_count': p['lines'], 'peg_count': p['pegs'] if p['display_pegs'] else 0, 'elements': count, 'fixed_style': 'line { mix-blend-mode: difference; }', 'native_bytes_unchanged': True}))
except Exception as error:
    print(json.dumps({'ok': False, 'error': str(error)}))
    sys.exit(1)
