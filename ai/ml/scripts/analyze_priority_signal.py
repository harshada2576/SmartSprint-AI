from pathlib import Path
import json

import pandas as pd


ROOT_DIR = Path(__file__).resolve().parents[3]
DATA_PATH = ROOT_DIR / "seed" / "requirements.json"


NUMERIC_FEATURES = [
    "customer_importance",
    "urgency",
    "complexity",
    "estimated_effort",
    "risk",
    "story_points",
]


def main():
    with DATA_PATH.open("r", encoding="utf-8") as file:
        records = json.load(file)

    df = pd.DataFrame(records)

    print("=" * 70)
    print("SMARTSPRINT AI - PRIORITY SIGNAL ANALYSIS")
    print("=" * 70)

    print("\nPriority distribution:")
    print(df["priority"].value_counts())

    print("\n" + "=" * 70)
    print("MEAN FEATURE VALUES BY PRIORITY")
    print("=" * 70)

    means = (
        df.groupby("priority")[NUMERIC_FEATURES]
        .mean()
        .round(2)
    )

    print(means)

    print("\n" + "=" * 70)
    print("MEDIAN FEATURE VALUES BY PRIORITY")
    print("=" * 70)

    medians = (
        df.groupby("priority")[NUMERIC_FEATURES]
        .median()
        .round(2)
    )

    print(medians)

    print("\n" + "=" * 70)
    print("BUSINESS VALUE BY PRIORITY")
    print("=" * 70)

    business_table = pd.crosstab(
        df["priority"],
        df["business_value"],
        normalize="index",
    ).round(3) * 100

    print(business_table)

    print("\n" + "=" * 70)
    print("CATEGORY BY PRIORITY (%)")
    print("=" * 70)

    category_table = pd.crosstab(
        df["priority"],
        df["category"],
        normalize="index",
    ).round(3) * 100

    print(category_table)

    print("\n" + "=" * 70)
    print("CORRELATION OF NUMERIC FEATURES WITH PRIORITY")
    print("=" * 70)

    priority_numeric = df["priority"].map(
        {
            "low": 0,
            "medium": 1,
            "high": 2,
        }
    )

    correlations = (
        df[NUMERIC_FEATURES]
        .corrwith(priority_numeric)
        .sort_values(
            key=lambda x: x.abs(),
            ascending=False,
        )
        .round(4)
    )

    print(correlations)


if __name__ == "__main__":
    main()