from pathlib import Path
import json

import joblib
import pandas as pd

from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder
from xgboost import XGBClassifier


ROOT_DIR = Path(__file__).resolve().parents[3]

DATA_PATH = ROOT_DIR / "seed" / "requirements.json"
MODEL_DIR = ROOT_DIR / "ai" / "ml" / "models"

MODEL_PATH = MODEL_DIR / "final_priority_model.joblib"
METADATA_PATH = MODEL_DIR / "final_priority_model_metadata.json"


FEATURES = [
    "category",
    "business_value",
    "customer_importance",
    "urgency",
    "risk",
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
    print("SMARTSPRINT AI - FINAL XGBOOST MODEL TRAINING")
    print("=" * 70)

    with DATA_PATH.open(
        "r",
        encoding="utf-8",
    ) as file:
        records = json.load(file)

    df = pd.DataFrame(records)

    X = df[FEATURES].copy()
    y = df[TARGET].map(LABEL_MAP)

    print(f"\nDataset: {len(df)} requirements")

    print("\nFeatures:")
    for feature in FEATURES:
        print(f"- {feature}")

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
        n_estimators=100,
        max_depth=2,
        learning_rate=0.08,
        min_child_weight=5,
        subsample=0.9,
        colsample_bytree=0.8,
        gamma=0,
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

    pipeline.fit(X, y)

    MODEL_DIR.mkdir(
        parents=True,
        exist_ok=True,
    )

    joblib.dump(
        pipeline,
        MODEL_PATH,
    )

    metadata = {
        "model": "XGBoost",
        "target": "priority",
        "classes": [
            "low",
            "medium",
            "high",
        ],
        "features": FEATURES,
        "categorical_features": CATEGORICAL_FEATURES,
        "training_records": len(df),
        "parameters": {
            "n_estimators": 100,
            "max_depth": 2,
            "learning_rate": 0.08,
            "min_child_weight": 5,
            "subsample": 0.9,
            "colsample_bytree": 0.8,
            "gamma": 0,
        },
        "validation": {
            "cv_accuracy": 0.6048,
            "cv_accuracy_std": 0.0275,
            "cv_macro_f1": 0.5065,
            "cv_macro_f1_std": 0.0265,
            "cv_balanced_accuracy": 0.4920,
            "cv_balanced_accuracy_std": 0.0248,
        },
    }

    with METADATA_PATH.open(
        "w",
        encoding="utf-8",
    ) as file:
        json.dump(
            metadata,
            file,
            indent=2,
        )

    print("\nFinal model saved to:")
    print(MODEL_PATH)

    print("\nMetadata saved to:")
    print(METADATA_PATH)

    print("\n" + "=" * 70)
    print("FINAL MODEL READY")
    print("=" * 70)


if __name__ == "__main__":
    main()