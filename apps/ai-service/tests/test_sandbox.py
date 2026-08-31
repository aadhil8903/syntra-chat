import pytest
import pandas as pd
from data_analysis.sandbox import execute_sandboxed_pandas, validate_python_code

def test_sandbox_executes_safe_aggregations():
    df = pd.DataFrame({'Sales': [100, 200, 300], 'Region': ['North', 'South', 'North']})
    code = """
result = df.groupby('Region')['Sales'].sum().reset_index()
print(f"Total North: {result[result['Region']=='North']['Sales'].values[0]}")
"""
    res_obj, stdout, err = execute_sandboxed_pandas(code, {"df": df})
    assert err is None
    assert "Total North: 400" in stdout

def test_sandbox_blocks_os_module_import():
    df = pd.DataFrame({'A': [1, 2]})
    code = "import os; os.system('echo hacked')"
    err = validate_python_code(code)
    assert err is not None
    assert "os" in err.lower()

def test_sandbox_blocks_eval_and_exec():
    df = pd.DataFrame({'A': [1, 2]})
    code = "eval('1 + 1')"
    err = validate_python_code(code)
    assert err is not None

def test_sandbox_blocks_open_and_file_access():
    df = pd.DataFrame({'A': [1, 2]})
    code = "open('/etc/passwd', 'r').read()"
    err = validate_python_code(code)
    assert err is not None

def test_sandbox_blocks_subclasses_escape():
    df = pd.DataFrame({'A': [1, 2]})
    code = "[c for c in ().__class__.__base__.__subclasses__() if c.__name__ == 'catch_warnings']"
    err = validate_python_code(code)
    assert err is not None
