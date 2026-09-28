from pathlib import Path
import json

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.metrics import (
    accuracy_score,
    balanced_accuracy_score,
    f1_score,
)
from sklearn.model_selection import StratifiedKFold
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder
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


def create_pipeline():
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

    return Pipeline(
        steps=[
            ("preprocessor", preprocessor),
            ("model", model),
        ]
    )


def main():
    with DATA_PATH.open(
        "r",
        encoding="utf-8",
    ) as file:
        records = json.load(file)

    df = pd.DataFrame(records)

    X = df[FEATURES].copy()
    y = df[TARGET].map(LABEL_MAP)

    cv = StratifiedKFold(
        n_splits=5,
        shuffle=True,
        random_state=42,
    )

    accuracy_scores = []
    macro_f1_scores = []
    balanced_accuracy_scores = []

    print("=" * 70)
    print("SMARTSPRINT AI - TUNED XGBOOST 5-FOLD CV")
    print("=" * 70)

    for fold, (train_idx, test_idx) in enumerate(
        cv.split(X, y),
        start=1,
    ):
        X_train = X.iloc[train_idx]
        X_test = X.iloc[test_idx]

        y_train = y.iloc[train_idx]
        y_test = y.iloc[test_idx]

        sample_weights = compute_sample_weight(
            class_weight="balanced",
            y=y_train,
        )

        pipeline = create_pipeline()

        pipeline.fit(
            X_train,
            y_train,
            model__sample_weight=sample_weights,
        )

        y_pred = pipeline.predict(X_test)

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

        accuracy_scores.append(accuracy)
        macro_f1_scores.append(macro_f1)
        balanced_accuracy_scores.append(
            balanced_accuracy
        )

        print(
            f"Fold {fold}: "
            f"accuracy={accuracy:.4f}, "
            f"macro_f1={macro_f1:.4f}, "
            f"balanced_accuracy={balanced_accuracy:.4f}"
        )

    print("\n" + "=" * 70)
    print("FINAL TUNED XGBOOST CV RESULTS")
    print("=" * 70)

    print(
        f"\nMean Accuracy: "
        f"{np.mean(accuracy_scores):.4f} "
        f"+/- {np.std(accuracy_scores):.4f}"
    )

    print(
        f"Mean Macro F1: "
        f"{np.mean(macro_f1_scores):.4f} "
        f"+/- {np.std(macro_f1_scores):.4f}"
    )

    print(
        f"Mean Balanced Accuracy: "
        f"{np.mean(balanced_accuracy_scores):.4f} "
        f"+/- {np.std(balanced_accuracy_scores):.4f}"
    )


if __name__ == "__main__":
    main()