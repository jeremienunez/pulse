"""Read-only AST/token and optional Lizard facts for the captured source list."""

import ast
import io
import json
from pathlib import Path
import sys
import tokenize


def code_lines(source):
    rows = source.splitlines()
    active = set()
    ignored = {
        tokenize.COMMENT,
        tokenize.NL,
        tokenize.NEWLINE,
        tokenize.INDENT,
        tokenize.DEDENT,
        tokenize.ENDMARKER,
        tokenize.ENCODING,
    }
    for token in tokenize.generate_tokens(io.StringIO(source).readline):
        if token.type not in ignored:
            active.update(
                n
                for n in range(token.start[0], token.end[0] + 1)
                if n <= len(rows) and rows[n - 1].strip()
            )
    return active


class Facts(ast.NodeVisitor):
    def __init__(self, source):
        self.active = code_lines(source)
        self.stack = []
        self.functions = []
        self.classes = []
        self.imports = []

    def describe(self, node):
        return {
            "symbol": ".".join([*self.stack, node.name]),
            "start": node.lineno,
            "end": node.end_lineno,
            "nloc": sum(node.lineno <= n <= node.end_lineno for n in self.active),
        }

    def visit_FunctionDef(self, node):
        row = self.describe(node)
        row["parameters"] = (
            len(node.args.posonlyargs)
            + len(node.args.args)
            + len(node.args.kwonlyargs)
            + bool(node.args.vararg)
            + bool(node.args.kwarg)
        )
        row["exported"] = not node.name.startswith("_")
        self.functions.append(row)
        self.stack.append(node.name)
        self.generic_visit(node)
        self.stack.pop()

    def visit_AsyncFunctionDef(self, node):
        self.visit_FunctionDef(node)

    def visit_ClassDef(self, node):
        row = self.describe(node)
        methods = [
            n
            for n in node.body
            if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))
        ]
        row["public_methods"] = sum(not n.name.startswith("_") for n in methods)
        row["static_only"] = bool(methods) and all(
            any(
                isinstance(d, ast.Name) and d.id == "staticmethod"
                for d in n.decorator_list
            )
            for n in methods
        )
        self.classes.append(row)
        self.stack.append(node.name)
        self.generic_visit(node)
        self.stack.pop()

    def visit_Import(self, node):
        self.imports.extend({"target": a.name, "line": node.lineno} for a in node.names)

    def visit_ImportFrom(self, node):
        self.imports.append(
            {"target": "." * node.level + (node.module or ""), "line": node.lineno}
        )


def analyze(root, name, mode):
    target = (root / name).resolve()
    if not target.is_relative_to(root) or not target.is_file():
        raise ValueError("Source is outside captured root: " + name)
    source = target.read_text(encoding="utf-8")
    if mode == "lizard":
        import lizard  # Prepared toolchain only; never installed by this helper.
        from importlib.metadata import version

        if version("lizard") != "1.24.1":
            raise ValueError("The profile requires Lizard 1.24.1")
        result = lizard.analyze_file(str(target))
        functions = [
            {
                "symbol": f.long_name,
                "start": f.start_line,
                "end": f.end_line,
                "nloc": f.nloc,
                "complexity": f.cyclomatic_complexity,
                "parameters": len(f.parameters),
            }
            for f in result.function_list
        ]
        return {
            "path": name,
            "functions": functions,
            "generation_marker": "GENERATED CODE" in source
            or "lizard forgives" in source,
        }
    facts = Facts(source)
    facts.visit(ast.parse(source, filename=name))
    return {
        "path": name,
        "functions": facts.functions,
        "classes": facts.classes,
        "imports": facts.imports,
    }


def main():
    request = json.load(sys.stdin)
    root = Path(request["root"]).resolve()
    result = [
        analyze(root, name, request.get("mode", "python")) for name in request["files"]
    ]
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
