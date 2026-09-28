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

TARGET = "priority"

LABEL_MAP = {
    "low": 0,
    "medium": 1,
    "high": 2,
}

FEATURE_SETS = {
    "all_8": [
        "category",
        "business_value",
        "customer_importance",
        "urgency",
        "complexity",
        "estimated_effort",
        "risk",
        "story_points",
    ],
    "top_5": [
        "category",
        "business_value",
        "customer_importance",
        "urgency",
        "risk",
    ],
    "top_4": [
        "category",
        "business_value",
        "customer_importance",
        "urgency",
    ],
}


def create_pipeline(features):
    categorical_features = [
        feature
        for feature in features
        if feature in [
            "category",
            "business_value",
        ]
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


def evaluate_feature_set(
    df,
    feature_name,
    features,
):
    X = df[features].copy()
    y = df[TARGET].map(LABEL_MAP)

    cv = StratifiedKFold(
        n_splits=5,
        shuffle=True,
        random_state=42,
    )

    accuracies = []
    macro_f1_scores = []
    balanced_accuracies = []

    for train_idx, test_idx in cv.split(X, y):
        X_train = X.iloc[train_idx]
        X_test = X.iloc[test_idx]

        y_train = y.iloc[train_idx]
        y_test = y.iloc[test_idx]

        model = create_pipeline(features)

        model.fit(
            X_train,
            y_train,
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
        "feature_set": feature_name,
        "features": features,
        "mean_accuracy": np.mean(accuracies),
        "std_accuracy": np.std(accuracies),
        "mean_macro_f1": np.mean(macro_f1_scores),
        "std_macro_f1": np.std(macro_f1_scores),
        "mean_balanced_accuracy": np.mean(
            balanced_accuracies
        ),
        "std_balanced_accuracy": np.std(
            balanced_accuracies
        ),
    }


def main():
    print("=" * 70)
    print("SMARTSPRINT AI - XGBOOST FEATURE SELECTION")
    print("=" * 70)

    with DATA_PATH.open(
        "r",
        encoding="utf-8",
    ) as file:
        records = json.load(file)

    df = pd.DataFrame(records)

    results = []

    for feature_name, features in FEATURE_SETS.items():
        print(
            f"\nEvaluating {feature_name}:"
        )
        print(
            "Features:",
            ", ".join(features),
        )

        result = evaluate_feature_set(
            df,
            feature_name,
            features,
        )

        results.append(result)

        print(
            f"Accuracy: "
            f"{result['mean_accuracy']:.4f} "
            f"+/- {result['std_accuracy']:.4f}"
        )

        print(
            f"Macro F1: "
            f"{result['mean_macro_f1']:.4f} "
            f"+/- {result['std_macro_f1']:.4f}"
        )

        print(
            f"Balanced Accuracy: "
            f"{result['mean_balanced_accuracy']:.4f} "
            f"+/- "
            f"{result['std_balanced_accuracy']:.4f}"
        )

    print("\n" + "=" * 70)
    print("FINAL COMPARISON")
    print("=" * 70)

    comparison = pd.DataFrame(results)

    print(
        comparison[
            [
                "feature_set",
                "mean_accuracy",
                "mean_macro_f1",
                "mean_balanced_accuracy",
            ]
        ].to_string(index=False)
    )


if __name__ == "__main__":
    main()