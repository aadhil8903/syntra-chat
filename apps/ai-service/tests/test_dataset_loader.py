import os
import tempfile
import unittest
import asyncio
import pandas as pd
import numpy as np
from data_analysis.dataset_loader import (
    clean_dataframe_numerics,
    load_dataframes_for_analysis,
    load_dataframe_sync,
    load_dataframe,
    resolve_dataset_filepath,
)


class TestDatasetLoader(unittest.TestCase):
    def test_clean_dataframe_percentages_and_currencies(self):
        df = pd.DataFrame({
            "Company": ["HDFC Bank", "Reliance", "ICICI Bank"],
            "WEIGHTAGE(%)": ["13.06%", "9.53%", "7.82%"],
            "Revenue": ["$1,250,000", "$950,000", "$780,000"],
            "Growth": ["12.5%", "8.2%", "-3.1%"],
        })

        cleaned = clean_dataframe_numerics(df)
        self.assertEqual(cleaned["Company"].tolist(), ["HDFC Bank", "Reliance", "ICICI Bank"])
        self.assertTrue(pd.api.types.is_float_dtype(cleaned["WEIGHTAGE(%)"]))
        self.assertAlmostEqual(cleaned["WEIGHTAGE(%)"].iloc[0], 13.06)
        self.assertAlmostEqual(cleaned["Revenue"].iloc[0], 1250000.0)
        self.assertAlmostEqual(cleaned["Growth"].iloc[2], -3.1)

    def test_clean_dataframe_mixed_and_blanks(self):
        df = pd.DataFrame({
            "Category": ["A", "B", "C"],
            "Value": ["1,500.50", " - ", "2,300.00"],
            "INR_Amount": ["₹50,000", "₹1,20,000", "₹35,500"],
        })

        cleaned = clean_dataframe_numerics(df)
        self.assertTrue(pd.api.types.is_float_dtype(cleaned["Value"]))
        self.assertAlmostEqual(cleaned["Value"].iloc[0], 1500.50)
        self.assertTrue(np.isnan(cleaned["Value"].iloc[1]))
        self.assertAlmostEqual(cleaned["INR_Amount"].iloc[0], 50000.0)

    def test_load_dataframe_csv(self):
        with tempfile.NamedTemporaryFile(suffix=".csv", delete=False, mode="w", encoding="utf-8") as f:
            f.write("SYMBOL,SECURITY,WEIGHTAGE(%)\nHDFCBANK,HDFC Bank,10.45\nICICIBANK,ICICI Bank,9.43\n")
            temp_path = f.name

        try:
            df, dfs = load_dataframe_sync(temp_path, file_type="csv")
            self.assertIsNotNone(df)
            self.assertEqual(len(df), 2)
            self.assertEqual(list(df.columns), ["SYMBOL", "SECURITY", "WEIGHTAGE(%)"])
            self.assertIn("df", dfs)
            self.assertAlmostEqual(df["WEIGHTAGE(%)"].iloc[0], 10.45)
        finally:
            if os.path.exists(temp_path):
                os.remove(temp_path)

    def test_load_dataframe_xlsx_multiple_sheets(self):
        with tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False) as f:
            temp_path = f.name

        try:
            with pd.ExcelWriter(temp_path) as writer:
                df1 = pd.DataFrame({"Quarter": ["Q1", "Q2"], "Revenue": [100, 150]})
                df2 = pd.DataFrame({"Region": ["North", "South"], "Sales": [50, 75]})
                df1.to_excel(writer, sheet_name="Financials", index=False)
                df2.to_excel(writer, sheet_name="Regional", index=False)

            df, dfs = load_dataframe_sync(temp_path, file_type="xlsx")
            self.assertIsNotNone(df)
            self.assertEqual(len(df), 2)
            self.assertIn("Financials", dfs)
            self.assertIn("Regional", dfs)
            self.assertIn("df", dfs)
        finally:
            if os.path.exists(temp_path):
                os.remove(temp_path)

    def test_load_dataframe_dict_fallback(self):
        ds_dict = {
            "id": "mock_ds_1",
            "originalName": "mock.csv",
            "fileType": "csv",
            "sheets": [
                {
                    "sheetName": "Sheet1",
                    "previewRows": [
                        {"Item": "A", "Cost": "$100.00"},
                        {"Item": "B", "Cost": "$200.00"},
                    ],
                }
            ],
        }
        df, dfs = load_dataframe_sync(ds_dict)
        self.assertIsNotNone(df)
        self.assertEqual(len(df), 2)
        self.assertAlmostEqual(df["Cost"].iloc[0], 100.0)

    def test_load_dataframe_async(self):
        async def run_async():
            with tempfile.NamedTemporaryFile(suffix=".csv", delete=False, mode="w", encoding="utf-8") as f:
                f.write("A,B\n1,2\n3,4\n")
                temp_path = f.name
            try:
                df, dfs = await load_dataframe(temp_path)
                self.assertIsNotNone(df)
                self.assertEqual(len(df), 2)
            finally:
                if os.path.exists(temp_path):
                    os.remove(temp_path)

        asyncio.run(run_async())


if __name__ == "__main__":
    unittest.main()

