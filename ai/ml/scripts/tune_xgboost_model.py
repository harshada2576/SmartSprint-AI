from pathlib import Path
import json

import joblib
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
from sklearn.model_selection import (
    RandomizedSearchCV,
    train_test_split,
)
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder
from sklearn.utils.class_weight import compute_sample_weight

from xgboost import XGBClassifier


# ---------------------------------------------------------
# Paths
# ---------------------------------------------------------

ROOT_DIR = Path(__file__).resolve().parents[3]

DATA_PATH = ROOT_DIR / "seed" / "requirements.json"

MODEL_DIR = ROOT_DIR / "ai" / "ml" / "models"

MODEL_PATH = MODEL_DIR / "xgboost_tuned_priority_model.joblib"

METRICS_PATH = (
    MODEL_DIR / "xgboost_tuned_priority_metrics.json"
)


# ---------------------------------------------------------
# Features
# ---------------------------------------------------------

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
    print("SMARTSPRINT AI - XGBOOST HYPERPARAMETER TUNING")
    print("=" * 70)

    # -----------------------------------------------------
    # Load data
    # -----------------------------------------------------

    with DATA_PATH.open(
        "r",
        encoding="utf-8",
    ) as file:
        records = json.load(file)

    df = pd.DataFrame(records)

    print(
        f"\nDataset loaded: {len(df)} requirements"
    )

    # -----------------------------------------------------
    # Prepare X and y
    # -----------------------------------------------------

    X = df[FEATURES].copy()

    y = df[TARGET].map(LABEL_MAP)

    if y.isna().any():
        raise ValueError(
            "Unexpected priority class found."
        )

    # -----------------------------------------------------
    # IMPORTANT:
    # Keep a final test set completely untouched.
    # Hyperparameter tuning happens only on X_train.
    # -----------------------------------------------------

    X_train, X_test, y_train, y_test = train_test_split(
        X,
        y,
        test_size=0.20,
        random_state=42,
        stratify=y,
    )

    print(
        f"Training samples: {len(X_train)}"
    )

    print(
        f"Final test samples: {len(X_test)}"
    )

    # -----------------------------------------------------
    # Class-balanced sample weights
    # -----------------------------------------------------

    sample_weights = compute_sample_weight(
        class_weight="balanced",
        y=y_train,
    )

    # -----------------------------------------------------
    # Pipeline
    # -----------------------------------------------------

    pipeline = create_pipeline()

    # -----------------------------------------------------
    # Search space
    # -----------------------------------------------------

    parameter_space = {
        "model__n_estimators": [
            200,
            300,
            400,
            500,
        ],
        "model__max_depth": [
            3,
            4,
            5,
            6,
        ],
        "model__learning_rate": [
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
        ],
        "model__subsample": [
            0.80,
            0.90,
            1.00,
        ],
        "model__colsample_bytree": [
            0.80,
            0.90,
            1.00,
        ],
        "model__gamma": [
            0,
            0.1,
            0.3,
        ],
    }

    # -----------------------------------------------------
    # Randomized search
    # -----------------------------------------------------

    search = RandomizedSearchCV(
        estimator=pipeline,
        param_distributions=parameter_space,
        n_iter=20,
        scoring="f1_macro",
        cv=5,
        random_state=42,
        n_jobs=-1,
        verbose=1,
        refit=True,
    )

    print("\nStarting hyperparameter search...")
    print("20 parameter combinations × 5 folds")

    search.fit(
        X_train,
        y_train,
        model__sample_weight=sample_weights,
    )

    print("\n" + "=" * 70)
    print("BEST PARAMETERS")
    print("=" * 70)

    for parameter, value in search.best_params_.items():
        print(
            f"{parameter}: {value}"
        )

    print(
        f"\nBest CV Macro F1: "
        f"{search.best_score_:.4f}"
    )

    # -----------------------------------------------------
    # Final evaluation on untouched test set
    # -----------------------------------------------------

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
    print("TUNED XGBOOST - FINAL TEST RESULTS")
    print("=" * 70)

    print(
        f"\nAccuracy: "
        f"{accuracy:.4f}"
    )

    print(
        f"Macro F1: "
        f"{macro_f1:.4f}"
    )

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

    # -----------------------------------------------------
    # Save model
    # -----------------------------------------------------

    MODEL_DIR.mkdir(
        parents=True,
        exist_ok=True,
    )

    joblib.dump(
        best_model,
        MODEL_PATH,
    )

    print(
        "\nModel saved to:"
    )

    print(MODEL_PATH)

    # -----------------------------------------------------
    # Save metrics
    # -----------------------------------------------------

    metrics = {
        "model": "XGBClassifier - Tuned",
        "target": TARGET,
        "features": FEATURES,
        "training_samples": len(X_train),
        "testing_samples": len(X_test),
        "best_cv_macro_f1": round(
            float(search.best_score_),
            4,
        ),
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
        "best_parameters": {
            key: (
                float(value)
                if isinstance(
                    value,
                    np.floating,
                )
                else int(value)
                if isinstance(
                    value,
                    np.integer,
                )
                else value
            )
            for key, value
            in search.best_params_.items()
        },
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

    print(
        "Metrics saved to:"
    )

    print(METRICS_PATH)

    print("\n" + "=" * 70)
    print("TUNING COMPLETE")
    print("=" * 70)


if __name__ == "__main__":
    main()