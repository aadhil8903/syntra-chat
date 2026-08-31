import pytest
import pandas as pd
from data_analysis.sandbox import validate_python_code, execute_sandboxed_pandas

test_adversarial_payloads = [
    ("pd.io.common.os.system('id')", "Attribute access to submodule os"),
    ("().__class__.__bases__[0].__subclasses__()", "Dunder __subclasses__ traversal"),
    ("(lambda: 0).__code__", "Code object inspection"),
    ("def f(): pass\nf.__globals__['__builtins__']", "Function globals inspection"),
    ("pd.__dict__['read_csv']", "Dict traversal"),
    ("try:\n    1/0\nexcept Exception as e:\n    e.__traceback__.tb_frame.f_globals", "Exception traceback frame traversal"),
    ("__import__('os').system('id')", "Direct __import__ of os"),
    ("import importlib; importlib.import_module('os')", "Importlib import"),
    ("[eval('1+1') for _ in [1]]", "Eval in comprehension"),
    ("open('package.json').read()", "Direct open"),
    ("import os as my_math", "Aliasing banned module as harmless name"),
    ("from subprocess import Popen", "From import of banned module"),
    ("import math; getattr(math, 'sin')", "Getattr call"),
]

@pytest.mark.parametrize("code,description", test_adversarial_payloads)
def test_sandbox_blocks_adversarial_payloads(code, description):
    df = pd.DataFrame({"A": [1, 2, 3]})
    err = validate_python_code(code)
    res_obj, stdout, exec_err = execute_sandboxed_pandas(code, {"df": df})
    
    is_blocked = (err is not None) or (exec_err is not None and ("not allowed" in str(exec_err) or "restricted" in str(exec_err) or "Importing" in str(exec_err) or "name" in str(exec_err)))
    assert is_blocked, f"Adversarial payload was NOT blocked: {description} (code: {code})"
