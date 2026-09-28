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
    print("SMARTSPRINT AI - ACCURACY-OPTIMIZED XGBOOST 5-FOLD CV")
    print("=" * 70)

    with DATA_PATH.open("r", encoding="utf-8") as file:
        records = json.load(file)

    df = pd.DataFrame(records)

    X = df[FEATURES].copy()
    y = df[TARGET].map(LABEL_MAP)

    print(f"\nDataset: {len(df)} requirements")

    cv = StratifiedKFold(
        n_splits=5,
        shuffle=True,
        random_state=42,
    )

    accuracies = []
    macro_f1_scores = []
    balanced_accuracies = []

    for fold, (train_idx, test_idx) in enumerate(
        cv.split(X, y),
        start=1,
    ):
        X_train = X.iloc[train_idx]
        X_test = X.iloc[test_idx]

        y_train = y.iloc[train_idx]
        y_test = y.iloc[test_idx]

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

        accuracies.append(accuracy)
        macro_f1_scores.append(macro_f1)
        balanced_accuracies.append(balanced_accuracy)

        print(
            f"\nFold {fold}:"
            f" Accuracy={accuracy:.4f},"
            f" Macro F1={macro_f1:.4f},"
            f" Balanced Accuracy={balanced_accuracy:.4f}"
        )

    mean_accuracy = np.mean(accuracies)
    std_accuracy = np.std(accuracies)

    mean_macro_f1 = np.mean(macro_f1_scores)
    std_macro_f1 = np.std(macro_f1_scores)

    mean_balanced_accuracy = np.mean(
        balanced_accuracies
    )
    std_balanced_accuracy = np.std(
        balanced_accuracies
    )

    print("\n" + "=" * 70)
    print("5-FOLD CROSS-VALIDATION RESULTS")
    print("=" * 70)

    print(
        f"\nMean Accuracy: "
        f"{mean_accuracy:.4f} +/- {std_accuracy:.4f}"
    )

    print(
        f"Mean Macro F1: "
        f"{mean_macro_f1:.4f} +/- {std_macro_f1:.4f}"
    )

    print(
        f"Mean Balanced Accuracy: "
        f"{mean_balanced_accuracy:.4f} "
        f"+/- {std_balanced_accuracy:.4f}"
    )


if __name__ == "__main__":
    main()