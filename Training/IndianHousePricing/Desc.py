import numpy as np
import pandas as pd
import matplotlib.pyplot as plt


df = pd.read_csv('IndianHousePricing/indian_house_prices_dataset.csv')

print(df.head())
print("Shape:", df.shape)

print("==============================================")
print("Dataset Information:")
print("==============================================")

df.info()

print("==============================================")
print("Statistical Description:")
print("==============================================")

print(df.describe())

print("==============================================")
print("Duplicate Rows:")
print("==============================================")

print(df.duplicated().sum())

print("==============================================")
print("Null Values:")
print("==============================================")

print(df.isnull().sum())

print("==============================================")
print("Numerical Columns:")
print("==============================================")

print(df.select_dtypes(include=np.number).columns)

print("==============================================")
print("Categorical Columns:")
print("==============================================")

print(df.select_dtypes(include="str").columns)

print("==============================================")
print("Correlation with Price:")
print("==============================================")

correlation = df.select_dtypes(include=np.number).corr()

print(
    correlation["Price_INR_Lakhs"]
    .sort_values(ascending=False)
)

plt.figure(figsize=(12, 9))
plt.imshow(
    correlation,
    cmap="coolwarm",
    aspect="auto"
)

plt.colorbar()
plt.xticks(
    range(len(correlation.columns)),
    correlation.columns,
    rotation=90
)

plt.yticks(
    range(len(correlation.columns)),
    correlation.columns
)

plt.title("Correlation Heatmap")
plt.tight_layout()
plt.show()

print("==============================================")
print("Correlation with Price:")
print("==============================================")

print(
    correlation["Price_INR_Lakhs"]
    .sort_values(ascending=False)
)

X = df.drop(columns=["Price_INR_Lakhs", "Property_ID"]) #house ki info
y = df["Price_INR_Lakhs"] #jis price ko predict karna hai

X = pd.get_dummies(X, drop_first=True)

print("==============================================")
print("Test/Train Split:")
print("==============================================")

from sklearn.model_selection import train_test_split

X_train, X_test, y_train, y_test = train_test_split(
    X,
    y,
    test_size=0.2,
    random_state=42
)

print("==============================================")
print("Training Random Forest Regressor:")
print("==============================================")

from sklearn.ensemble import RandomForestRegressor

model = RandomForestRegressor(
    n_estimators=200,
    random_state=42,
    n_jobs=-1
)

model.fit(X_train, y_train)

## predicting the prices for the test set
y_pred = model.predict(X_test)

## model evaluation
from sklearn.metrics import mean_absolute_error
from sklearn.metrics import mean_squared_error
from sklearn.metrics import r2_score
import numpy as np

mae = mean_absolute_error(y_test, y_pred)
mse = mean_squared_error(y_test, y_pred)
rmse = np.sqrt(mse)
r2 = r2_score(y_test, y_pred)

print("MAE :", mae)
print("MSE :", mse)
print("RMSE:", rmse)
print("R²  :", r2)