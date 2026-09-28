from pathlib import Path
import json

import numpy as np
import pandas as pd

from sklearn.compose import ColumnTransformer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    f1_score,
    balanced_accuracy_score,
)
from sklearn.model_selection import StratifiedKFold
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder
from sklearn.tree import DecisionTreeClassifier
from sklearn.ensemble import RandomForestClassifier
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


def create_preprocessor():
    return ColumnTransformer(
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


def create_models():
    return {
        "Logistic Regression": LogisticRegression(
            max_iter=2000,
            class_weight="balanced",
            random_state=42,
        ),

        "Decision Tree": DecisionTreeClassifier(
            max_depth=6,
            min_samples_leaf=4,
            class_weight="balanced",
            random_state=42,
        ),

        "Random Forest": RandomForestClassifier(
            n_estimators=300,
            max_depth=None,
            min_samples_leaf=2,
            class_weight="balanced",
            random_state=42,
            n_jobs=-1,
        ),

        "XGBoost": XGBClassifier(
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
        ),
    }


def main():
    with DATA_PATH.open("r", encoding="utf-8") as file:
        records = json.load(file)

    df = pd.DataFrame(records)

    X = df[FEATURES].copy()
    y = df[TARGET].map(LABEL_MAP)

    cv = StratifiedKFold(
        n_splits=5,
        shuffle=True,
        random_state=42,
    )

    results = []

    print("=" * 75)
    print("SMARTSPRINT AI - MODEL BENCHMARK")
    print("5-FOLD STRATIFIED CROSS-VALIDATION")
    print("=" * 75)

    for model_name, model in create_models().items():

        accuracy_scores = []
        f1_scores = []
        balanced_scores = []

        print(f"\n{'-' * 75}")
        print(model_name)
        print(f"{'-' * 75}")

        for fold, (train_idx, test_idx) in enumerate(
            cv.split(X, y),
            start=1,
        ):
            X_train = X.iloc[train_idx]
            X_test = X.iloc[test_idx]

            y_train = y.iloc[train_idx]
            y_test = y.iloc[test_idx]

            pipeline = Pipeline(
                steps=[
                    (
                        "preprocessor",
                        create_preprocessor(),
                    ),
                    (
                        "model",
                        model,
                    ),
                ]
            )

            if model_name == "XGBoost":
                sample_weights = compute_sample_weight(
                    class_weight="balanced",
                    y=y_train,
                )

                pipeline.fit(
                    X_train,
                    y_train,
                    model__sample_weight=sample_weights,
                )
            else:
                pipeline.fit(
                    X_train,
                    y_train,
                )

            y_pred = pipeline.predict(X_test)

            accuracy_scores.append(
                accuracy_score(y_test, y_pred)
            )

            f1_scores.append(
                f1_score(
                    y_test,
                    y_pred,
                    average="macro",
                )
            )

            balanced_scores.append(
                balanced_accuracy_score(
                    y_test,
                    y_pred,
                )
            )

        mean_accuracy = float(
            np.mean(accuracy_scores)
        )

        mean_f1 = float(
            np.mean(f1_scores)
        )

        mean_balanced = float(
            np.mean(balanced_scores)
        )

        std_accuracy = float(
            np.std(accuracy_scores)
        )

        print(
            f"Mean Accuracy:           {mean_accuracy:.4f}"
        )

        print(
            f"Mean Macro F1:           {mean_f1:.4f}"
        )

        print(
            f"Mean Balanced Accuracy:  {mean_balanced:.4f}"
        )

        print(
            f"Accuracy Std:            {std_accuracy:.4f}"
        )

        results.append(
            {
                "model": model_name,
                "accuracy_mean": round(
                    mean_accuracy,
                    4,
                ),
                "accuracy_std": round(
                    std_accuracy,
                    4,
                ),
                "macro_f1_mean": round(
                    mean_f1,
                    4,
                ),
                "balanced_accuracy_mean": round(
                    mean_balanced,
                    4,
                ),
            }
        )

    print("\n" + "=" * 75)
    print("FINAL MODEL COMPARISON")
    print("=" * 75)

    results_df = pd.DataFrame(results)

    print(
        results_df.to_string(
            index=False
        )
    )

    output_path = (
        ROOT_DIR
        / "ai"
        / "ml"
        / "models"
        / "model_benchmark_results.json"
    )

    output_path.write_text(
        json.dumps(
            results,
            indent=2,
        ),
        encoding="utf-8",
    )

    print("\nResults saved to:")
    print(output_path)


if __name__ == "__main__":
    main()