from pathlib import Path
import json

import joblib
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
)
from sklearn.model_selection import train_test_split
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

MODEL_PATH = MODEL_DIR / "xgboost_priority_model.joblib"
METRICS_PATH = MODEL_DIR / "xgboost_priority_model_metrics.json"


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

TARGET = "priority"

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


def main() -> None:
    print("=" * 60)
    print("SmartSprint AI - XGBoost Priority Model Training")
    print("=" * 60)

    # -----------------------------------------------------
    # Load dataset
    # -----------------------------------------------------

    if not DATA_PATH.exists():
        raise FileNotFoundError(
            f"Dataset not found: {DATA_PATH}"
        )

    with DATA_PATH.open("r", encoding="utf-8") as file:
        records = json.load(file)

    df = pd.DataFrame(records)

    print(f"\nDataset loaded: {len(df)} requirements")

    # -----------------------------------------------------
    # Validate columns
    # -----------------------------------------------------

    required_columns = FEATURES + [TARGET]

    missing_columns = [
        column
        for column in required_columns
        if column not in df.columns
    ]

    if missing_columns:
        raise ValueError(
            f"Missing required columns: {missing_columns}"
        )

    # -----------------------------------------------------
    # Prepare X and y
    # -----------------------------------------------------

    X = df[FEATURES].copy()
    y = df[TARGET].copy()

    print("\nTarget distribution:")
    print(y.value_counts())

    # -----------------------------------------------------
    # Convert target labels to numeric classes
    # -----------------------------------------------------

    label_map = {
        "low": 0,
        "medium": 1,
        "high": 2,
    }

    y_encoded = y.map(label_map)

    if y_encoded.isna().any():
        raise ValueError("Unexpected priority class found.")

    # -----------------------------------------------------
    # Train/test split
    # -----------------------------------------------------

    X_train, X_test, y_train, y_test = train_test_split(
        X,
        y_encoded,
        test_size=0.20,
        random_state=42,
        stratify=y_encoded,
    )

    print("\nTraining samples:", len(X_train))
    print("Testing samples :", len(X_test))

    # -----------------------------------------------------
    # Handle class imbalance
    # -----------------------------------------------------

    sample_weights = compute_sample_weight(
        class_weight="balanced",
        y=y_train,
    )

    # -----------------------------------------------------
    # Preprocessing
    # -----------------------------------------------------

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

    # -----------------------------------------------------
    # XGBoost model
    # -----------------------------------------------------

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

    # -----------------------------------------------------
    # Pipeline
    # -----------------------------------------------------

    pipeline = Pipeline(
        steps=[
            ("preprocessor", preprocessor),
            ("model", model),
        ]
    )

    # -----------------------------------------------------
    # Train
    # -----------------------------------------------------

    print("\nTraining XGBoost model...")

    pipeline.fit(
        X_train,
        y_train,
        model__sample_weight=sample_weights,
    )

    print("Training completed.")

    # -----------------------------------------------------
    # Predict
    # -----------------------------------------------------

    y_pred_encoded = pipeline.predict(X_test)

    # Convert numeric predictions back to labels
    reverse_label_map = {
        0: "low",
        1: "medium",
        2: "high",
    }

    y_test_labels = [
        reverse_label_map[int(value)]
        for value in y_test
    ]

    y_pred_labels = [
        reverse_label_map[int(value)]
        for value in y_pred_encoded
    ]

    # -----------------------------------------------------
    # Evaluation
    # -----------------------------------------------------

    accuracy = accuracy_score(
        y_test_labels,
        y_pred_labels,
    )

    print("\n" + "=" * 60)
    print("XGBOOST MODEL EVALUATION")
    print("=" * 60)

    print(f"\nAccuracy: {accuracy:.4f}")

    print("\nClassification Report:")

    print(
        classification_report(
            y_test_labels,
            y_pred_labels,
            labels=["high", "medium", "low"],
            digits=4,
            zero_division=0,
        )
    )

    print("Confusion Matrix:")

    print(
        confusion_matrix(
            y_test_labels,
            y_pred_labels,
            labels=["high", "medium", "low"],
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
        pipeline,
        MODEL_PATH,
    )

    print("\nModel saved to:")
    print(MODEL_PATH)

    # -----------------------------------------------------
    # Save metrics
    # -----------------------------------------------------

    metrics = {
        "model": "XGBClassifier",
        "target": TARGET,
        "features": FEATURES,
        "training_samples": len(X_train),
        "testing_samples": len(X_test),
        "accuracy": round(float(accuracy), 4),
        "classes": ["low", "medium", "high"],
        "class_distribution": {
            str(label): int(count)
            for label, count in y.value_counts().items()
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

    print("Metrics saved to:")
    print(METRICS_PATH)

    print("\n" + "=" * 60)
    print("XGBOOST TRAINING COMPLETE")
    print("=" * 60)


if __name__ == "__main__":
    main()