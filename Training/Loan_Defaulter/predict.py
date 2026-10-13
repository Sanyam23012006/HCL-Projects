import joblib
import pandas as pd

# 1. LOAD TRAINED MODEL

model = joblib.load("loan_default_model.pkl")

print("Model loaded successfully!")

# 2. NEW CUSTOMER DATA

customer = pd.DataFrame([{

    "age": 35,
    "gender": "Male",
    "marital_status": "Married",
    "dependents": 2,
    "education": "Graduate",
    "employment_type": "Salaried",
    "employment_years": 8,
    "annual_income": 700000,
    "monthly_income": 58000,
    "residence_type": "Owned",

    "credit_score": 720,
    "credit_history_years": 8,
    "existing_loans": 1,
    "existing_loan_amount": 150000,
    "monthly_debt_payment": 8000,
    "credit_card_utilization": 25,
    "previous_defaults": 0,
    "late_payments_12m": 1,
    "credit_accounts": 4,
    "recent_credit_inquiries": 1,

    "loan_type": "Personal",
    "loan_amount": 300000,
    "loan_term_months": 36,
    "interest_rate": 11.5,
    "monthly_emi": 9900,
    "loan_to_income_ratio": 0.43,
    "emi_to_income_ratio": 0.17,
    "debt_to_income_ratio": 0.31,
    "down_payment": 0,
    "purpose": "Education",
    "application_channel": "Online",
    "account_balance": 120000,
    "avg_monthly_balance": 100000,
    "salary_delay_days": 0,
    "emi_payment_history": 98,
    "missed_payments_6m": 0,
    "missed_payments_12m": 1,
    "average_payment_delay_days": 1

}])

# 3. MAKE PREDICTION

prediction = model.predict(customer)[0]

probability = model.predict_proba(customer)[0][1]

# 4. DISPLAY RESULT
print("******************************LOAN-DEFAULT-PREDICTION******************************")

print(
    "Default Probability:",
    round(probability * 100, 2),
    "%"
)

if prediction == 1:

    print("Prediction: POTENTIAL DEFAULT")

else:

    print("Prediction: NON-DEFAULT")