import ast
import io
import sys
import math
import datetime
import json
import re
import itertools
import collections
import statistics
import pandas as pd
import numpy as np
from typing import Dict, Any, Optional, Tuple
from schemas.chat import TableSpec

ALLOWED_MODULES = {
    "math", "datetime", "json", "re", "itertools", "collections", "statistics",
    "pandas", "numpy", "scipy"
}

def safe_import(name, *args, **kwargs):
    base_module = name.split(".")[0]
    if base_module not in ALLOWED_MODULES:
        raise ImportError(f"Importing '{base_module}' is not permitted in the sandbox.")
    return __import__(name, *args, **kwargs)

# Safe built-ins allowed in sandboxed python execution
SAFE_BUILTINS = {
    "__import__": safe_import,
    "abs": abs,
    "all": all,
    "any": any,
    "bool": bool,
    "dict": dict,
    "enumerate": enumerate,
    "filter": filter,
    "float": float,
    "int": int,
    "isinstance": isinstance,
    "issubclass": issubclass,
    "iter": iter,
    "len": len,
    "list": list,
    "map": map,
    "max": max,
    "min": min,
    "next": next,
    "pow": pow,
    "print": print,
    "range": range,
    "round": round,
    "set": set,
    "slice": slice,
    "sorted": sorted,
    "str": str,
    "sum": sum,
    "tuple": tuple,
    "zip": zip,
    "True": True,
    "False": False,
    "None": None,
}

BANNED_IMPORTS = {
    "os", "sys", "subprocess", "shutil", "socket", "http", "urllib", "requests",
    "ftplib", "builtins", "__builtin__", "importlib", "pickle", "ctypes", "threading",
    "multiprocessing", "pty", "commands", "io", "pathlib", "tempfile",
}

DANGEROUS_SYSTEM_METHODS = {
    "system", "popen", "spawn", "spawnl", "spawnv", "spawnve", "call", "check_call",
    "check_output", "execve", "execv", "execl", "execlp", "execvp", "execvpe",
    "remove", "unlink", "rmdir", "mkdir", "makedirs", "removedirs", "rename", "renames",
    "environ", "getenv", "putenv", "unsetenv", "chdir", "fchdir", "chmod", "chown",
    "kill", "killpg", "fork", "pipe", "readlink", "symlink", "link",
}

BANNED_NAMES = {
    "eval", "exec", "compile", "open", "input", "globals", "locals",
    "vars", "dir", "getattr", "setattr", "delattr", "hasattr", "__subclasses__",
    "__bases__", "__class__", "__globals__", "__dict__", "__code__", "__closure__",
    "__func__", "__self__", "__module__", "__qualname__", "__annotations__",
    "__traceback__", "f_globals", "f_locals", "f_builtins", "tb_frame",
} | BANNED_IMPORTS | DANGEROUS_SYSTEM_METHODS


class SecurityValidator(ast.NodeVisitor):
    def __init__(self):
        self.errors = []

    def visit_Import(self, node: ast.Import):
        for alias in node.names:
            base_module = alias.name.split(".")[0]
            if base_module in BANNED_IMPORTS or base_module not in ALLOWED_MODULES:
                self.errors.append(f"Importing '{base_module}' is not allowed for security reasons.")
        self.generic_visit(node)

    def visit_ImportFrom(self, node: ast.ImportFrom):
        if node.module:
            base_module = node.module.split(".")[0]
            if base_module in BANNED_IMPORTS or base_module not in ALLOWED_MODULES:
                self.errors.append(f"Importing from '{base_module}' is not allowed for security reasons.")
        self.generic_visit(node)

    def visit_Name(self, node: ast.Name):
        if node.id in BANNED_NAMES:
            self.errors.append(f"Access to identifier '{node.id}' is restricted.")
        self.generic_visit(node)

    def visit_Attribute(self, node: ast.Attribute):
        if node.attr in BANNED_NAMES or node.attr.startswith("_"):
            self.errors.append(f"Access to attribute '{node.attr}' is restricted.")
        self.generic_visit(node)


def validate_python_code(code_str: str) -> Optional[str]:
    """Validates Python code AST for dangerous calls or forbidden imports."""
    try:
        parsed = ast.parse(code_str)
    except SyntaxError as e:
        return f"Syntax error in code: {e.msg} (line {e.lineno})"

    validator = SecurityValidator()
    validator.visit(parsed)

    if validator.errors:
        return "; ".join(validator.errors)
    return None


def execute_sandboxed_pandas(
    code_str: str,
    dataframes: Dict[str, pd.DataFrame],
) -> Tuple[Optional[Any], str, Optional[str]]:
    """
    Executes pandas code in a restricted scope.
    Returns (result_object, stdout_output, error_message).
    """
    # 1. AST Security Validation
    security_error = validate_python_code(code_str)
    if security_error:
        return None, "", security_error

    # 2. Setup execution context
    safe_globals: Dict[str, Any] = {
        "__builtins__": SAFE_BUILTINS,
        "pd": pd,
        "pandas": pd,
        "np": np,
        "numpy": np,
        "math": math,
        "datetime": datetime,
        "json": json,
        "re": re,
    }

    # Inject dataframes
    safe_locals: Dict[str, Any] = {}
    for name, df in dataframes.items():
        safe_locals[name] = df.copy()

    # Capture stdout
    stdout_capture = io.StringIO()
    old_stdout = sys.stdout

    try:
        sys.stdout = stdout_capture
        # Execute code in isolated namespace
        exec(code_str, safe_globals, safe_locals)
    except Exception as e:
        return None, stdout_capture.getvalue(), f"Execution error: {type(e).__name__}: {str(e)}"
    finally:
        sys.stdout = old_stdout

    captured_stdout = stdout_capture.getvalue()
    result = safe_locals.get("result", None)

    return result, captured_stdout, None


def format_analysis_result_as_table(result: Any) -> Optional[TableSpec]:
    """Converts a pandas DataFrame or Series or dict result to a TableSpec."""
    if isinstance(result, pd.DataFrame):
        df_clean = result.replace({np.nan: None})
        columns = [str(c) for c in df_clean.columns]
        rows = df_clean.head(100).values.tolist()
        return TableSpec(
            title="Analysis Output",
            columns=columns,
            rows=rows,
            totalRows=len(df_clean),
        )
    elif isinstance(result, pd.Series):
        df = result.reset_index()
        columns = [str(c) for c in df.columns]
        rows = df.head(100).values.tolist()
        return TableSpec(
            title="Analysis Output",
            columns=columns,
            rows=rows,
            totalRows=len(df),
        )
    return None
