from pathlib import Path
import json

import joblib
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder


# ---------------------------------------------------------
# Paths
# ---------------------------------------------------------

ROOT_DIR = Path(__file__).resolve().parents[3]

DATA_PATH = ROOT_DIR / "seed" / "requirements.json"
MODEL_DIR = ROOT_DIR / "ai" / "ml" / "models"

MODEL_PATH = MODEL_DIR / "priority_model.joblib"
METRICS_PATH = MODEL_DIR / "priority_model_metrics.json"


# ---------------------------------------------------------
# ML configuration
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
    print("SmartSprint AI - Requirement Priority Model Training")
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
    # Validate required columns
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
    # Train/test split
    # -----------------------------------------------------

    X_train, X_test, y_train, y_test = train_test_split(
        X,
        y,
        test_size=0.20,
        random_state=42,
        stratify=y,
    )

    print("\nTraining samples:", len(X_train))
    print("Testing samples :", len(X_test))

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
    # Model
    # -----------------------------------------------------

    model = RandomForestClassifier(
        n_estimators=300,
        random_state=42,
        class_weight="balanced",
        min_samples_leaf=2,
        n_jobs=-1,
    )

    pipeline = Pipeline(
        steps=[
            ("preprocessor", preprocessor),
            ("model", model),
        ]
    )

    # -----------------------------------------------------
    # Train
    # -----------------------------------------------------

    print("\nTraining model...")

    pipeline.fit(X_train, y_train)

    print("Training completed.")

    # -----------------------------------------------------
    # Evaluate
    # -----------------------------------------------------

    y_pred = pipeline.predict(X_test)

    accuracy = accuracy_score(y_test, y_pred)

    print("\n" + "=" * 60)
    print("MODEL EVALUATION")
    print("=" * 60)

    print(f"\nAccuracy: {accuracy:.4f}")

    print("\nClassification Report:")
    print(
        classification_report(
            y_test,
            y_pred,
            digits=4,
            zero_division=0,
        )
    )

    labels = sorted(y.unique())

    print("Confusion Matrix:")
    print(
        confusion_matrix(
            y_test,
            y_pred,
            labels=labels,
        )
    )

    # -----------------------------------------------------
    # Save model
    # -----------------------------------------------------

    MODEL_DIR.mkdir(parents=True, exist_ok=True)

    joblib.dump(pipeline, MODEL_PATH)

    print(f"\nModel saved to:")
    print(MODEL_PATH)

    # -----------------------------------------------------
    # Save metrics
    # -----------------------------------------------------

    metrics = {
        "model": "RandomForestClassifier",
        "target": TARGET,
        "features": FEATURES,
        "training_samples": len(X_train),
        "testing_samples": len(X_test),
        "accuracy": round(float(accuracy), 4),
        "classes": labels,
        "class_distribution": {
            str(label): int(count)
            for label, count in y.value_counts().items()
        },
    }

    with METRICS_PATH.open("w", encoding="utf-8") as file:
        json.dump(metrics, file, indent=2)

    print("Metrics saved to:")
    print(METRICS_PATH)

    print("\n" + "=" * 60)
    print("TRAINING COMPLETE")
    print("=" * 60)


if __name__ == "__main__":
    main()