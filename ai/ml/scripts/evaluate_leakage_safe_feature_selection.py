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

CATEGORICAL_FEATURES = [
    "category",
    "business_value",
]

NUMERIC_FEATURES = [
    "customer_importance",
    "urgency",
    "complexity",
    "estimated_effort",
    "risk",
    "story_points",
]


def create_pipeline(features):
    categorical_features = [
        feature
        for feature in features
        if feature in CATEGORICAL_FEATURES
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


def aggregate_importance(
    feature_names,
    importances,
):
    grouped = {}

    for feature_name, importance in zip(
        feature_names,
        importances,
    ):
        if "category_" in feature_name:
            group = "category"

        elif "business_value_" in feature_name:
            group = "business_value"

        elif feature_name.startswith(
            "remainder__"
        ):
            group = feature_name.replace(
                "remainder__",
                "",
            )

        else:
            group = feature_name

        grouped[group] = (
            grouped.get(group, 0.0)
            + float(importance)
        )

    return pd.Series(grouped).sort_values(
        ascending=False
    )


def evaluate_predictions(
    y_test,
    y_pred,
):
    return {
        "accuracy": accuracy_score(
            y_test,
            y_pred,
        ),
        "macro_f1": f1_score(
            y_test,
            y_pred,
            average="macro",
        ),
        "balanced_accuracy": balanced_accuracy_score(
            y_test,
            y_pred,
        ),
    }


def main():
    print("=" * 70)
    print(
        "SMARTSPRINT AI - LEAKAGE-SAFE "
        "FEATURE SELECTION"
    )
    print("=" * 70)

    with DATA_PATH.open(
        "r",
        encoding="utf-8",
    ) as file:
        records = json.load(file)

    df = pd.DataFrame(records)

    X = df[ALL_FEATURES].copy()
    y = df[TARGET].map(LABEL_MAP)

    cv = StratifiedKFold(
        n_splits=5,
        shuffle=True,
        random_state=42,
    )

    baseline_results = []
    selected_results = []

    selected_features_per_fold = []

    for fold, (train_idx, test_idx) in enumerate(
        cv.split(X, y),
        start=1,
    ):
        X_train = X.iloc[train_idx].copy()
        X_test = X.iloc[test_idx].copy()

        y_train = y.iloc[train_idx]
        y_test = y.iloc[test_idx]

        # ---------------------------------------------------------
        # 1. ALL-8 FEATURE BASELINE
        # ---------------------------------------------------------
        baseline_model = create_pipeline(
            ALL_FEATURES
        )

        baseline_model.fit(
            X_train,
            y_train,
        )

        baseline_pred = baseline_model.predict(
            X_test
        )

        baseline_metrics = evaluate_predictions(
            y_test,
            baseline_pred,
        )

        baseline_results.append(
            baseline_metrics
        )

        # ---------------------------------------------------------
        # 2. FEATURE SELECTION USING TRAINING FOLD ONLY
        # ---------------------------------------------------------
        importance_model = create_pipeline(
            ALL_FEATURES
        )

        importance_model.fit(
            X_train,
            y_train,
        )

        preprocessor = (
            importance_model.named_steps[
                "preprocessor"
            ]
        )

        xgb_model = (
            importance_model.named_steps[
                "model"
            ]
        )

        feature_names = (
            preprocessor
            .get_feature_names_out()
        )

        importances = (
            xgb_model.feature_importances_
        )

        aggregated = aggregate_importance(
            feature_names,
            importances,
        )

        top_5 = list(
            aggregated.head(5).index
        )

        selected_features_per_fold.append(
            top_5
        )

        print(
            f"\nFold {fold} selected features:"
        )

        for feature in top_5:
            print(
                f"  - {feature}"
            )

        # ---------------------------------------------------------
        # 3. TRAIN NEW MODEL USING ONLY SELECTED FEATURES
        # ---------------------------------------------------------
        selected_model = create_pipeline(
            top_5
        )

        selected_model.fit(
            X_train[top_5],
            y_train,
        )

        selected_pred = selected_model.predict(
            X_test[top_5]
        )

        selected_metrics = evaluate_predictions(
            y_test,
            selected_pred,
        )

        selected_results.append(
            selected_metrics
        )

        print(
            f"Fold {fold}: "
            f"All-8 Accuracy="
            f"{baseline_metrics['accuracy']:.4f}, "
            f"Top-5 Accuracy="
            f"{selected_metrics['accuracy']:.4f}"
        )

    # -------------------------------------------------------------
    # SUMMARY
    # -------------------------------------------------------------
    baseline_accuracy = [
        result["accuracy"]
        for result in baseline_results
    ]

    baseline_f1 = [
        result["macro_f1"]
        for result in baseline_results
    ]

    baseline_balanced = [
        result["balanced_accuracy"]
        for result in baseline_results
    ]

    selected_accuracy = [
        result["accuracy"]
        for result in selected_results
    ]

    selected_f1 = [
        result["macro_f1"]
        for result in selected_results
    ]

    selected_balanced = [
        result["balanced_accuracy"]
        for result in selected_results
    ]

    print("\n" + "=" * 70)
    print("LEAKAGE-SAFE 5-FOLD RESULTS")
    print("=" * 70)

    print("\nALL 8 FEATURES")

    print(
        f"Accuracy: "
        f"{np.mean(baseline_accuracy):.4f} "
        f"+/- "
        f"{np.std(baseline_accuracy):.4f}"
    )

    print(
        f"Macro F1: "
        f"{np.mean(baseline_f1):.4f} "
        f"+/- "
        f"{np.std(baseline_f1):.4f}"
    )

    print(
        f"Balanced Accuracy: "
        f"{np.mean(baseline_balanced):.4f} "
        f"+/- "
        f"{np.std(baseline_balanced):.4f}"
    )

    print("\nLEAKAGE-SAFE TOP 5")

    print(
        f"Accuracy: "
        f"{np.mean(selected_accuracy):.4f} "
        f"+/- "
        f"{np.std(selected_accuracy):.4f}"
    )

    print(
        f"Macro F1: "
        f"{np.mean(selected_f1):.4f} "
        f"+/- "
        f"{np.std(selected_f1):.4f}"
    )

    print(
        f"Balanced Accuracy: "
        f"{np.mean(selected_balanced):.4f} "
        f"+/- "
        f"{np.std(selected_balanced):.4f}"
    )

    print("\n" + "=" * 70)
    print("FEATURE SELECTION FREQUENCY")
    print("=" * 70)

    frequency = {}

    for feature_list in selected_features_per_fold:
        for feature in feature_list:
            frequency[feature] = (
                frequency.get(feature, 0) + 1
            )

    frequency_df = (
        pd.DataFrame(
            {
                "feature": list(
                    frequency.keys()
                ),
                "selected_in_folds": list(
                    frequency.values()
                ),
            }
        )
        .sort_values(
            "selected_in_folds",
            ascending=False,
        )
        .reset_index(drop=True)
    )

    print(
        frequency_df.to_string(
            index=False
        )
    )


if __name__ == "__main__":
    main()