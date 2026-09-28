from pathlib import Path
import json

import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import OneHotEncoder
from sklearn.pipeline import Pipeline
from sklearn.utils.class_weight import compute_sample_weight
from xgboost import XGBClassifier


ROOT_DIR = Path(__file__).resolve().parents[3]
DATA_PATH = ROOT_DIR / "seed" / "requirements.json"


FEATURES = [
    "category",
    "business_value",
    "customer_importance",
    "urgency",
    "complexity",
    "estimated_effort",
    "risk",
    "story_points",
]

CATEGORICAL_FEATURES = [
    "category",
    "business_value",
]

TARGET = "priority"

LABEL_MAP = {
    "low": 0,
    "medium": 1,
    "high": 2,
}


def main():
    print("=" * 70)
    print("SMARTSPRINT AI - XGBOOST FEATURE IMPORTANCE")
    print("=" * 70)

    with DATA_PATH.open(
        "r",
        encoding="utf-8",
    ) as file:
        records = json.load(file)

    df = pd.DataFrame(records)

    X = df[FEATURES].copy()
    y = df[TARGET].map(LABEL_MAP)

    preprocessor = ColumnTransformer(
        transformers=[
            (
                "categorical",
                OneHotEncoder(
                    handle_unknown="ignore",
                    sparse_output=False,
                ),
                CATEGORICAL_FEATURES,
            )
        ],
        remainder="passthrough",
    )

    model = XGBClassifier(
        n_estimators=200,
        max_depth=6,
        learning_rate=0.05,
        min_child_weight=7,
        subsample=0.8,
        gamma=0.1,
        colsample_bytree=0.9,
        objective="multi:softprob",
        num_class=3,
        eval_metric="mlogloss",
        random_state=42,
        n_jobs=-1,
    )

    pipeline = Pipeline(
        steps=[
            ("preprocessor", preprocessor),
            ("model", model),
        ]
    )

    sample_weights = compute_sample_weight(
        class_weight="balanced",
        y=y,
    )

    pipeline.fit(
        X,
        y,
        model__sample_weight=sample_weights,
    )

    fitted_preprocessor = pipeline.named_steps["preprocessor"]
    fitted_model = pipeline.named_steps["model"]

    feature_names = fitted_preprocessor.get_feature_names_out()
    importances = fitted_model.feature_importances_

    importance_df = pd.DataFrame(
        {
            "feature": feature_names,
            "importance": importances,
        }
    )

    importance_df = importance_df.sort_values(
        "importance",
        ascending=False,
    )

    print("\nTop model features:")
    print(
        importance_df.head(20).to_string(
            index=False
        )
    )

    # Aggregate one-hot encoded features back to their
    # original feature groups.
    grouped = {}

    for feature_name, importance in zip(
        feature_names,
        importances,
    ):
        if "category_" in feature_name:
            base = "category"
        elif "business_value_" in feature_name:
            base = "business_value"
        else:
            base = feature_name.split("__")[-1]

        grouped[base] = (
            grouped.get(base, 0.0)
            + float(importance)
        )

    grouped_df = pd.DataFrame(
        [
            {
                "feature": feature,
                "importance": value,
            }
            for feature, value in grouped.items()
        ]
    ).sort_values(
        "importance",
        ascending=False,
    )

    print("\n" + "=" * 70)
    print("AGGREGATED FEATURE IMPORTANCE")
    print("=" * 70)

    print(
        grouped_df.to_string(
            index=False
        )
    )


if __name__ == "__main__":
    main()