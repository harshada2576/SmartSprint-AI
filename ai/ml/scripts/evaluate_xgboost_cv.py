from pathlib import Path
import json

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.metrics import accuracy_score, f1_score, balanced_accuracy_score
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
            ),
        ],
        remainder="passthrough",
    )

    model = XGBClassifier(
        n_estimators=300,
        max_depth=4,
        learning_rate=0.05,
        subsample=0.9,
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
    df = pd.DataFrame(
        json.loads(DATA_PATH.read_text(encoding="utf-8"))
    )

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

    print("=" * 60)
    print("XGBOOST 5-FOLD CROSS-VALIDATION")
    print("Using the same class balancing as training")
    print("=" * 60)

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

        balanced_acc = balanced_accuracy_score(
            y_test,
            y_pred,
        )

        accuracy_scores.append(accuracy)
        macro_f1_scores.append(macro_f1)
        balanced_accuracy_scores.append(balanced_acc)

        print(
            f"\nFold {fold}: "
            f"accuracy={accuracy:.4f}, "
            f"macro_f1={macro_f1:.4f}, "
            f"balanced_accuracy={balanced_acc:.4f}"
        )

    print("\n" + "=" * 60)
    print("FINAL CROSS-VALIDATION RESULTS")
    print("=" * 60)

    print(
        "\nAccuracy:",
        round(float(np.mean(accuracy_scores)), 4),
        "+/-",
        round(float(np.std(accuracy_scores)), 4),
    )

    print(
        "Macro F1:",
        round(float(np.mean(macro_f1_scores)), 4),
        "+/-",
        round(float(np.std(macro_f1_scores)), 4),
    )

    print(
        "Balanced Accuracy:",
        round(float(np.mean(balanced_accuracy_scores)), 4),
        "+/-",
        round(float(np.std(balanced_accuracy_scores)), 4),
    )


if __name__ == "__main__":
    main()