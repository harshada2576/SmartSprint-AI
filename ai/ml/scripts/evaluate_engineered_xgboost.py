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


LABEL_MAP = {
    "low": 0,
    "medium": 1,
    "high": 2,
}


def create_features(df: pd.DataFrame) -> pd.DataFrame:
    data = df.copy()

    # Stronger features identified during signal analysis.
    data["importance_urgency"] = (
        data["customer_importance"] * data["urgency"] / 100
    )

    data["importance_risk"] = (
        data["customer_importance"] * data["risk"] / 100
    )

    data["urgency_risk"] = (
        data["urgency"] * data["risk"] / 100
    )

    # Combined demand/impact score.
    data["priority_signal_score"] = (
        0.40 * data["customer_importance"]
        + 0.30 * data["urgency"]
        + 0.20 * data["risk"]
        + 0.10 * data["story_points"]
    )

    return data


def create_pipeline():
    categorical_features = [
        "category",
        "business_value",
    ]

    numeric_features = [
        "customer_importance",
        "urgency",
        "risk",
        "story_points",
        "importance_urgency",
        "importance_risk",
        "urgency_risk",
        "priority_signal_score",
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
    with DATA_PATH.open("r", encoding="utf-8") as file:
        records = json.load(file)

    df = pd.DataFrame(records)

    df = create_features(df)

    feature_columns = [
        "category",
        "business_value",
        "customer_importance",
        "urgency",
        "risk",
        "story_points",
        "importance_urgency",
        "importance_risk",
        "urgency_risk",
        "priority_signal_score",
    ]

    X = df[feature_columns]
    y = df["priority"].map(LABEL_MAP)

    cv = StratifiedKFold(
        n_splits=5,
        shuffle=True,
        random_state=42,
    )

    accuracy_scores = []
    macro_f1_scores = []
    balanced_scores = []

    print("=" * 70)
    print("ENGINEERED XGBOOST - 5-FOLD CROSS-VALIDATION")
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

        accuracy = accuracy_score(y_test, y_pred)
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
        balanced_scores.append(balanced_accuracy)

        print(
            f"Fold {fold}: "
            f"accuracy={accuracy:.4f}, "
            f"macro_f1={macro_f1:.4f}, "
            f"balanced_accuracy={balanced_accuracy:.4f}"
        )

    print("\n" + "=" * 70)
    print("FINAL RESULTS")
    print("=" * 70)

    print(
        f"\nAccuracy: "
        f"{np.mean(accuracy_scores):.4f} "
        f"+/- {np.std(accuracy_scores):.4f}"
    )

    print(
        f"Macro F1: "
        f"{np.mean(macro_f1_scores):.4f} "
        f"+/- {np.std(macro_f1_scores):.4f}"
    )

    print(
        f"Balanced Accuracy: "
        f"{np.mean(balanced_scores):.4f} "
        f"+/- {np.std(balanced_scores):.4f}"
    )


if __name__ == "__main__":
    main()