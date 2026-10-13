import pandas as pd
import numpy as np
import seaborn as sns
import matplotlib.pyplot as plt
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LinearRegression
from sklearn.linear_model import LogisticRegression
from sklearn.neighbors import KNeighborsClassifier
from sklearn.svm import SVC
from sklearn.metrics import mean_squared_error
from sklearn.metrics import accuracy_score
from first.clean_dataset import X,Y,df

# 1. TRAIN / TEST SPLIT  (stratified)
X_train, X_test, Y_train, Y_test = train_test_split(
    X, Y,
    test_size=0.2,
    random_state=42,
    stratify=Y          # preserves class ratio in both splits
)

# print("X\t\tY")
# for x, y in zip(X_train, y_train):
#     print(x, "\t", y)

# sns.histplot(X_train)
# plt.show()
# sns.histplot(Y_train)
# plt.show()

print(f"\nTrain size : {X_train.shape}")
print(f"Test  size : {X_test.shape}")
print(f"\nTrain default rate: {Y_train.mean():.4f}")
print(f"Test  default rate: {Y_test.mean():.4f}")


# 2. SCALE NUMERIC FEATURES
scaler = StandardScaler()

num_cols_final = X_train.select_dtypes(include=['number']).columns.tolist()
X_train_scaled = X_train.copy()
X_test_scaled  = X_test.copy()

X_train_scaled[num_cols_final] = scaler.fit_transform(X_train[num_cols_final])
X_test_scaled[num_cols_final]  = scaler.transform(X_test[num_cols_final])

print(f"\nScaling applied. Ready for modelling.")

# 3. CREATE AND TRAIN MODEL

    # 1. Logistic Regression
model = LinearRegression()
model.fit(X_train, Y_train)

    # 2. Logistic Regression
logistic = LogisticRegression()
logistic.fit(X_train, Y_train)

    # 3. KNN
knn = KNeighborsClassifier(n_neighbors=5)
knn.fit(X_train, Y_train)

    # 4. SVM
svm = SVC(kernel="linear")
svm.fit(X_train, Y_train)

    # Predictions
model_pred = model.predict(X_test)
logistic_pred = logistic.predict(X_test)
knn_pred = knn.predict(X_test)
svm_pred = svm.predict(X_test)

    # Accuracy
print("Linear Regression:",
      accuracy_score(Y_test, model_pred))

print("Logistic Regression:",
      accuracy_score(Y_test, logistic_pred))

print("KNN:",
      accuracy_score(Y_test, knn_pred))

print("SVM:",
      accuracy_score(Y_test, svm_pred))
