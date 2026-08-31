import logging
from typing import Tuple, List
import tree_sitter_javascript as tsjs
from tree_sitter import Language, Parser

logger = logging.getLogger("quizloop.jsx_validator")

# Initialize tree-sitter JavaScript parser (supports JSX)
_js_language = Language(tsjs.language())
_parser = Parser(_js_language)

ALLOWED_MODULES = {
    "react", "framer-motion", "lucide-react", "recharts", 
    "canvas-confetti", "clsx", "tailwind-merge", "simulation-primitives", 
    "@/components/simulation-primitives"
}

def validate_jsx_code(code_str: str) -> Tuple[bool, List[str]]:
    """
    Validates that a JavaScript/JSX code string is syntactically valid
    and does not import disallowed external libraries.
    Returns (is_valid, list_of_errors).
    """
    if not code_str or not code_str.strip():
        return False, ["Code is empty."]

    errors = []
    code_bytes = code_str.encode("utf-8")
    tree = _parser.parse(code_bytes)
    root = tree.root_node

    # 1. Check for Tree-sitter Syntax Errors
    if root.has_error:
        def find_errors(node):
            if node.type == "ERROR" or node.is_missing:
                start_row, start_col = node.start_point
                end_row, end_col = node.end_point
                snippet = code_str.splitlines()[start_row] if start_row < len(code_str.splitlines()) else ""
                errors.append(
                    f"Syntax error near Line {start_row + 1}, Col {start_col + 1}: '{snippet.strip()}'"
                )
            for child in node.children:
                find_errors(child)

        find_errors(root)

    # 2. Check for Disallowed External Imports
    def check_imports(node):
        if node.type == "import_statement":
            # Find the string literal for source
            for child in node.children:
                if child.type == "string":
                    import_source = code_bytes[child.start_byte:child.end_byte].decode("utf-8").strip("'\"")
                    if import_source not in ALLOWED_MODULES and not import_source.startswith("."):
                        errors.append(
                            f"Illegal external import '{import_source}'. Only 'react', 'framer-motion', and 'lucide-react' are permitted."
                        )
        for child in node.children:
            check_imports(child)

    check_imports(root)

    # 3. Check for renderComponent call or App definition
    has_app = "function App" in code_str or "const App" in code_str or "let App" in code_str or "var App" in code_str
    if not has_app:
        errors.append("Code must declare a React component named 'App'.")

    is_valid = len(errors) == 0
    return is_valid, errors
