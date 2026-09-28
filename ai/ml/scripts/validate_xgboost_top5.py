from pathlib import Path
import json

import numpy as np
import pandas as pd

from sklearn.compose import ColumnTransformer
from sklearn.metrics import (
    accuracy_score,
    balanced_accuracy_score,
    classification_report,
    confusion_matrix,
    f1_score,
)
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder
from xgboost import XGBClassifier


ROOT_DIR = Path(__file__).resolve().parents[3]
DATA_PATH = ROOT_DIR / "seed" / "requirements.json"

TARGET = "priority"

LABEL_MAP = {
    "low": 0,
    "medium": 1,
    "high": 2,
}

REVERSE_LABEL_MAP = {
    0: "low",
    1: "medium",
    2: "high",
}

ALL_FEATURES = [
    "category",
    "business_value",
    "customer_importance",
    "urgency",
    "complexity",
    "estimated_effort",
    "risk",
    "story_points",
]

TOP_5_FEATURES = [
    "category",
    "business_value",
    "customer_importance",
    "urgency",
    "risk",
]


def create_pipeline():
    categorical_features = [
        "category",
        "business_value",
    ]

    preprocessor = ColumnTransformer(
        transformers=[
            (
                "categorical",
                OneHotEncoder(
                    handle_unknown="ignore",
                    sparse_output=False,
                ),
                categorical_features,
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

    return Pipeline(
        steps=[
            ("preprocessor", preprocessor),
            ("model", model),
        ]
    )


def main():
    print("=" * 70)
    print("SMARTSPRINT AI - TOP-5 XGBOOST VALIDATION")
    print("=" * 70)

    with DATA_PATH.open(
        "r",
        encoding="utf-8",
    ) as file:
        records = json.load(file)

    df = pd.DataFrame(records)

    X = df[TOP_5_FEATURES].copy()
    y = df[TARGET].map(LABEL_MAP)

    X_train, X_test, y_train, y_test = train_test_split(
        X,
        y,
        test_size=0.20,
        random_state=42,
        stratify=y,
    )

    print(f"\nDataset: {len(df)} requirements")
    print(f"Training: {len(X_train)}")
    print(f"Final test: {len(X_test)}")

    print("\nFeatures used:")
    for feature in TOP_5_FEATURES:
        print(f"- {feature}")

    model = create_pipeline()

    model.fit(
        X_train,
        y_train,
    )

    y_pred = model.predict(X_test)

    accuracy = accuracy_score(
        y_test,
        y_pred,
    )

    macro_f1 = f1_score(
        y_test,
        y_pred,
        average="macro",
    )

    balanced_accuracy = balanced_accuracy_score(
        y_test,
        y_pred,
    )

    y_test_labels = [
        REVERSE_LABEL_MAP[int(value)]
        for value in y_test
    ]

    y_pred_labels = [
        REVERSE_LABEL_MAP[int(value)]
        for value in y_pred
    ]

    print("\n" + "=" * 70)
    print("FINAL UNTOUCHED TEST RESULTS")
    print("=" * 70)

    print(f"\nAccuracy: {accuracy:.4f}")
    print(f"Macro F1: {macro_f1:.4f}")
    print(
        f"Balanced Accuracy: "
        f"{balanced_accuracy:.4f}"
    )

    print("\nClassification Report:")
    print(
        classification_report(
            y_test_labels,
            y_pred_labels,
            labels=[
                "high",
                "medium",
                "low",
            ],
            digits=4,
            zero_division=0,
        )
    )

    print("Confusion Matrix:")
    print(
        confusion_matrix(
            y_test_labels,
            y_pred_labels,
            labels=[
                "high",
                "medium",
                "low",
            ],
        )
    )

    print("\n" + "=" * 70)
    print("VALIDATION COMPLETE")
    print("=" * 70)


if __name__ == "__main__":
    main()