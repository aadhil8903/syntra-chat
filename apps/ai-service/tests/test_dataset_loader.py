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

    def test_deterministic_row_count_fast_path(self):
        from tools.analyze_dataset import try_format_deterministic_dataset_result

        res = try_format_deterministic_dataset_result(
            question="How many rows are in this dataset?",
            raw_result=1254,
            stdout="1254",
            dataset_name="10_employee_directory.xlsx",
        )
        self.assertIsNotNone(res)
        self.assertEqual(res, "The dataset '10_employee_directory.xlsx' contains 1,254 rows.")

    def test_deterministic_sum_aggregation_fast_path(self):
        from tools.analyze_dataset import try_format_deterministic_dataset_result

        res = try_format_deterministic_dataset_result(
            question="What is the total revenue?",
            raw_result=1428500.0,
            stdout="Total Revenue: $1,428,500.00",
            dataset_name="Q4_Sales_Report.xlsx",
        )
        self.assertIsNotNone(res)
        self.assertEqual(res, "Total Revenue: $1,428,500.00")

    def test_interpretive_query_bypasses_fast_path(self):
        from tools.analyze_dataset import try_format_deterministic_dataset_result

        # Interpretive queries must return None to trigger full Gemini LLM summary
        queries = [
            "Why did revenue decrease in Q3?",
            "Explain the pattern in employee churn",
            "Which vendors appear unusually risky and why?",
            "What does this trend mean for next quarter?",
            "Compare these groups and summarize the findings",
        ]
        for q in queries:
            res = try_format_deterministic_dataset_result(
                question=q,
                raw_result=100,
                stdout="100",
                dataset_name="report.xlsx",
            )
            self.assertIsNone(res, f"Expected None for interpretive query: {q}")

    def test_deterministic_bar_chart_generation(self):
        from tools.create_chart import try_construct_deterministic_chart
        from schemas.chat import ChartType

        data = [
            {"Region": "North", "Sales": 100000},
            {"Region": "South", "Sales": 150000},
            {"Region": "East", "Sales": 120000},
            {"Region": "West", "Sales": 180000},
        ]
        chart = try_construct_deterministic_chart("Create a bar chart of sales by region", data)
        self.assertIsNotNone(chart)
        self.assertEqual(chart.chartType, ChartType.BAR)
        self.assertEqual(chart.labels, ["North", "South", "East", "West"])
        self.assertEqual(chart.series[0].data, [100000.0, 150000.0, 120000.0, 180000.0])
        self.assertEqual(chart.series[0].name, "Sales")

    def test_deterministic_line_chart_generation(self):
        from tools.create_chart import try_construct_deterministic_chart
        from schemas.chat import ChartType

        data = [
            {"Month": "Jan", "Active Users": 1200},
            {"Month": "Feb", "Active Users": 1500},
            {"Month": "Mar", "Active Users": 1800},
        ]
        chart = try_construct_deterministic_chart("Plot a trend line of monthly active users", data)
        self.assertIsNotNone(chart)
        self.assertEqual(chart.chartType, ChartType.LINE)
        self.assertEqual(chart.labels, ["Jan", "Feb", "Mar"])
        self.assertEqual(chart.series[0].data, [1200.0, 1500.0, 1800.0])

    def test_deterministic_pie_chart_generation(self):
        from tools.create_chart import try_construct_deterministic_chart
        from schemas.chat import ChartType

        data = {"Engineering": 45, "Marketing": 25, "Sales": 30}
        chart = try_construct_deterministic_chart("Show a pie chart of department budget", data)
        self.assertIsNotNone(chart)
        self.assertEqual(chart.chartType, ChartType.PIE)
        self.assertEqual(chart.labels, ["Engineering", "Marketing", "Sales"])
        self.assertEqual(chart.series[0].data, [45.0, 25.0, 30.0])


if __name__ == "__main__":
    unittest.main()


