from pathlib import Path
import json

import joblib
import pandas as pd

from sklearn.compose import ColumnTransformer
from sklearn.metrics import (
    accuracy_score,
    balanced_accuracy_score,
    classification_report,
    confusion_matrix,
    f1_score,
)
from sklearn.model_selection import (
    RandomizedSearchCV,
    train_test_split,
)
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder
from xgboost import XGBClassifier


ROOT_DIR = Path(__file__).resolve().parents[3]

DATA_PATH = ROOT_DIR / "seed" / "requirements.json"
MODEL_DIR = ROOT_DIR / "ai" / "ml" / "models"

MODEL_PATH = (
    MODEL_DIR / "xgboost_accuracy_priority_model.joblib"
)

METRICS_PATH = (
    MODEL_DIR / "xgboost_accuracy_priority_metrics.json"
)


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

REVERSE_LABEL_MAP = {
    0: "low",
    1: "medium",
    2: "high",
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
    print("SMARTSPRINT AI - ACCURACY-OPTIMIZED XGBOOST")
    print("=" * 70)

    with DATA_PATH.open(
        "r",
        encoding="utf-8",
    ) as file:
        records = json.load(file)

    df = pd.DataFrame(records)

    X = df[FEATURES].copy()
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

    pipeline = create_pipeline()

    parameter_space = {
        "model__n_estimators": [
            100,
            150,
            200,
            250,
            300,
            400,
        ],
        "model__max_depth": [
            2,
            3,
            4,
            5,
            6,
        ],
        "model__learning_rate": [
            0.02,
            0.03,
            0.05,
            0.08,
            0.10,
        ],
        "model__min_child_weight": [
            1,
            3,
            5,
            7,
            10,
        ],
        "model__subsample": [
            0.70,
            0.80,
            0.90,
            1.00,
        ],
        "model__colsample_bytree": [
            0.70,
            0.80,
            0.90,
            1.00,
        ],
        "model__gamma": [
            0,
            0.05,
            0.10,
            0.20,
            0.30,
        ],
    }

    search = RandomizedSearchCV(
        estimator=pipeline,
        param_distributions=parameter_space,
        n_iter=30,
        scoring="accuracy",
        cv=5,
        random_state=42,
        n_jobs=-1,
        verbose=1,
        refit=True,
    )

    print("\nSearching 30 parameter combinations...")
    print("Optimization metric: accuracy")
    print("Class balancing: not used")

    search.fit(
        X_train,
        y_train,
    )

    print("\n" + "=" * 70)
    print("BEST PARAMETERS")
    print("=" * 70)

    for parameter, value in search.best_params_.items():
        print(f"{parameter}: {value}")

    print(
        f"\nBest CV Accuracy: "
        f"{search.best_score_:.4f}"
    )

    best_model = search.best_estimator_

    y_pred = best_model.predict(X_test)

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
    print("FINAL TEST RESULTS")
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

    MODEL_DIR.mkdir(
        parents=True,
        exist_ok=True,
    )

    joblib.dump(
        best_model,
        MODEL_PATH,
    )

    metrics = {
        "model": "XGBClassifier - Accuracy Optimized",
        "features": FEATURES,
        "test_accuracy": round(
            float(accuracy),
            4,
        ),
        "test_macro_f1": round(
            float(macro_f1),
            4,
        ),
        "test_balanced_accuracy": round(
            float(balanced_accuracy),
            4,
        ),
        "best_cv_accuracy": round(
            float(search.best_score_),
            4,
        ),
        "best_parameters": search.best_params_,
    }

    with METRICS_PATH.open(
        "w",
        encoding="utf-8",
    ) as file:
        json.dump(
            metrics,
            file,
            indent=2,
        )

    print("\nModel saved to:")
    print(MODEL_PATH)

    print("Metrics saved to:")
    print(METRICS_PATH)

    print("\n" + "=" * 70)
    print("EXPERIMENT COMPLETE")
    print("=" * 70)


if __name__ == "__main__":
    main()