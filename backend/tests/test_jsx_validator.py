import pytest
from app.utils.jsx_validator import validate_jsx_code

def test_valid_jsx_code():
    valid_code = """
    function App() {
        const [count, setCount] = React.useState(0);
        return (
            <div className="p-4 bg-slate-900 text-white">
                <h1>Simulation Title</h1>
                <button onClick={() => setCount(c => c + 1)}>Count: {count}</button>
            </div>
        );
    }
    renderComponent(App);
    """
    is_valid, errors = validate_jsx_code(valid_code)
    assert is_valid is True
    assert len(errors) == 0

def test_invalid_syntax_jsx_code():
    invalid_code = """
    function App() {
        return (
            <div>
                <span>Unclosed span
            </div>
        );
    }
    """
    is_valid, errors = validate_jsx_code(invalid_code)
    assert is_valid is False
    assert len(errors) > 0
    assert any("Syntax error" in e for e in errors)

def test_disallowed_external_import():
    code_with_d3 = """
    import * as d3 from 'd3';
    function App() {
        return <div>Test</div>;
    }
    """
    is_valid, errors = validate_jsx_code(code_with_d3)
    assert is_valid is False
    assert any("Illegal external import 'd3'" in e for e in errors)

def test_missing_app_component():
    code_without_app = """
    function MyCustomWidget() {
        return <div>Hello</div>;
    }
    """
    is_valid, errors = validate_jsx_code(code_without_app)
    assert is_valid is False
    assert any("must declare a React component named 'App'" in e for e in errors)
