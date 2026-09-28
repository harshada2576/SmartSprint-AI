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


CLASS_WEIGHT_OPTIONS = {
    "none": {
        0: 1.0,
        1: 1.0,
        2: 1.0,
    },
    "mild": {
        0: 1.15,
        1: 1.0,
        2: 1.25,
    },
    "moderate": {
        0: 1.30,
        1: 1.0,
        2: 1.50,
    },
    "strong": {
        0: 1.50,
        1: 1.0,
        2: 1.75,
    },
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


def evaluate_weight_set(
    X,
    y,
    weight_name,
    class_weights,
    cv,
):
    accuracies = []
    macro_f1_scores = []
    balanced_accuracies = []

    for train_idx, test_idx in cv.split(X, y):
        X_train = X.iloc[train_idx]
        X_test = X.iloc[test_idx]

        y_train = y.iloc[train_idx]
        y_test = y.iloc[test_idx]

        sample_weights = np.array(
            [
                class_weights[int(label)]
                for label in y_train
            ]
        )

        model = create_pipeline()

        model.fit(
            X_train,
            y_train,
            model__sample_weight=sample_weights,
        )

        y_pred = model.predict(X_test)

        accuracies.append(
            accuracy_score(
                y_test,
                y_pred,
            )
        )

        macro_f1_scores.append(
            f1_score(
                y_test,
                y_pred,
                average="macro",
            )
        )

        balanced_accuracies.append(
            balanced_accuracy_score(
                y_test,
                y_pred,
            )
        )

    return {
        "weight_scheme": weight_name,
        "accuracy": np.mean(accuracies),
        "accuracy_std": np.std(accuracies),
        "macro_f1": np.mean(macro_f1_scores),
        "macro_f1_std": np.std(macro_f1_scores),
        "balanced_accuracy": np.mean(
            balanced_accuracies
        ),
        "balanced_accuracy_std": np.std(
            balanced_accuracies
        ),
    }


def main():
    print("=" * 70)
    print("SMARTSPRINT AI - TOP-5 XGBOOST CLASS-WEIGHT EXPERIMENT")
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

    print("\nClass distribution:")
    print(df[TARGET].value_counts())

    cv = StratifiedKFold(
        n_splits=5,
        shuffle=True,
        random_state=42,
    )

    results = []

    for weight_name, class_weights in (
        CLASS_WEIGHT_OPTIONS.items()
    ):
        print("\n" + "-" * 70)
        print(f"Weight scheme: {weight_name}")
        print(
            f"low={class_weights[0]}, "
            f"medium={class_weights[1]}, "
            f"high={class_weights[2]}"
        )

        result = evaluate_weight_set(
            X,
            y,
            weight_name,
            class_weights,
            cv,
        )

        results.append(result)

        print(
            f"Accuracy: "
            f"{result['accuracy']:.4f} "
            f"+/- {result['accuracy_std']:.4f}"
        )

        print(
            f"Macro F1: "
            f"{result['macro_f1']:.4f} "
            f"+/- {result['macro_f1_std']:.4f}"
        )

        print(
            f"Balanced Accuracy: "
            f"{result['balanced_accuracy']:.4f} "
            f"+/- "
            f"{result['balanced_accuracy_std']:.4f}"
        )

    print("\n" + "=" * 70)
    print("FINAL CLASS-WEIGHT COMPARISON")
    print("=" * 70)

    comparison = pd.DataFrame(results)

    print(
        comparison[
            [
                "weight_scheme",
                "accuracy",
                "macro_f1",
                "balanced_accuracy",
            ]
        ].to_string(index=False)
    )


if __name__ == "__main__":
    main()