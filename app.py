import streamlit as st
import pandas as pd
import database
import gemini_service
import time

# Page Config
st.set_page_config(
    page_title="Invoice.AI",
    page_icon="📦",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Initialize DB
database.init_db()

# Custom CSS
st.markdown("""
<style>
    /* Import Fonts */
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&family=JetBrains+Mono:wght@400;700&display=swap');

    /* Global Reset & Theme */
    .stApp {
        background-color: #050505;
        color: #e0e0e0;
        font-family: 'Inter', sans-serif;
    }

    /* Sidebar */
    [data-testid="stSidebar"] {
        background-color: #0a0a0a;
        border-right: 1px solid #222;
    }
    [data-testid="stSidebar"] h1 {
        font-family: 'JetBrains Mono', monospace;
        color: #ff6b00;
        font-size: 1.5rem;
        letter-spacing: -1px;
    }

    /* Headers */
    h1, h2, h3 {
        font-family: 'Inter', sans-serif;
        font-weight: 800;
        color: #ffffff;
        letter-spacing: -0.5px;
    }
    
    /* Metrics */
    [data-testid="stMetricValue"] {
        font-family: 'JetBrains Mono', monospace;
        color: #ff6b00 !important;
        font-size: 2rem !important;
    }
    [data-testid="stMetricLabel"] {
        color: #888;
        font-size: 0.9rem;
        text-transform: uppercase;
        letter-spacing: 1px;
    }

    /* Buttons (Primary) */
    .stButton button {
        background: #ff6b00;
        color: black;
        font-family: 'JetBrains Mono', monospace;
        font-weight: 700;
        border: none;
        border-radius: 0;
        padding: 0.5rem 1.5rem;
        text-transform: uppercase;
        transition: all 0.2s ease;
        width: 100%;
    }
    .stButton button:hover {
        background: #ff8533;
        box-shadow: 0 0 15px rgba(255, 107, 0, 0.4);
        transform: translateY(-1px);
    }
    .stButton button:active {
        transform: translateY(0);
    }

    /* File Uploader */
    [data-testid="stFileUploader"] {
        border: 1px dashed #333;
        background: #111;
        padding: 2rem;
        border-radius: 8px;
    }
    [data-testid="stFileUploader"]:hover {
        border-color: #ff6b00;
        background: #161616;
    }

    /* Data Editor/Table */
    [data-testid="stDataFrame"] {
        border: 1px solid #222;
        border-radius: 4px;
        background: #111;
    }
    
    /* Chat Input */
    .stChatInputContainer textarea {
        background-color: #111;
        color: white;
        border: 1px solid #333;
    }
    .stChatInputContainer textarea:focus {
        border-color: #ff6b00;
        box-shadow: none;
    }
    
    /* Chat Messages */
    [data-testid="stChatMessage"] {
        background-color: transparent;
    }
    [data-testid="stChatMessage"][data-test-role="user"] {
        background-color: rgba(255, 107, 0, 0.1);
        border-left: 3px solid #ff6b00;
    }
    [data-testid="stChatMessage"][data-test-role="assistant"] {
        background-color: rgba(255, 255, 255, 0.05);
        border-left: 3px solid #444;
    }

    /* Success/Error Messages */
    .stAlert {
        background-color: #111;
        border: 1px solid #333;
        color: #eee;
    }
</style>
""", unsafe_allow_html=True)

# Sidebar
with st.sidebar:
    st.title("📦 INVOICE.AI")
    api_key = st.text_input("Gemini API Key", type="password")
    
    st.markdown("---")
    stats = database.get_stats()
    st.metric("Total Spend", f"${stats['total_spend']:,.2f}")
    st.metric("Invoices", stats['count'])
    st.metric("Duplicates", stats['duplicates'], delta_color="inverse")

# Main Content
st.title("Dashboard")

col1, col2 = st.columns([2, 1])
with col1:
    uploaded_files = st.file_uploader("Drop Invoices Here", accept_multiple_files=True, type=['png', 'jpg', 'jpeg', 'pdf'])
with col2:
    enable_camera = st.checkbox("Enable Camera")
    if enable_camera:
        camera_image = st.camera_input("Take Photo")

# Process Logic
files_to_process = (uploaded_files if uploaded_files else []) + ([camera_image] if enable_camera and camera_image else [])

if files_to_process:
    count = len(files_to_process)
    st.info(f"Queue: {count} items ready")
    
    if st.button(f"PROCESS BATCH ({count})", disabled=not api_key):
        if not api_key:
            st.error("Please enter API Key")
        else:
            progress = st.progress(0)
            status = st.empty()
            processed = 0
            
            for i, file in enumerate(files_to_process):
                status.text(f"Processing {file.name}...")
                try:
                    data = gemini_service.process_invoice(file.getvalue(), api_key)
                    database.save_invoice(data)
                    processed += 1
                except Exception as e:
                    st.error(f"Error: {e}")
                progress.progress(int((i + 1) / count * 100))
            
            status.text("Done!")
            time.sleep(1)
            st.rerun()

# Results
st.subheader("Invoice Totals")
invoices = database.get_all_invoices()

if invoices:
    data = [{
        "ID": i['id'],
        "Status": "DUPLICATE" if i['is_duplicate'] else "OK",
        "Date": str(i['date']),
        "Invoice #": i['invoice_number'],
        "Vendor": i['vendor'],
        "Category": i['category'],
        "Description": i['description'],
        "Qty": i['qty'],
        "Cost": i['unit_cost'],
        "Total": i['total_amount']
    } for i in invoices]
    
    st.data_editor(
        pd.DataFrame(data),
        column_config={
            "Status": st.column_config.TextColumn("Status", validate="^(OK|DUPLICATE)$"),
            "Total": st.column_config.NumberColumn("Total", format="$%.2f")
        },
        use_container_width=True,
        hide_index=True
    )
    
    if not stats['daily_trend'].empty:
        st.subheader("Daily Trend")
        st.bar_chart(stats['daily_trend'], x="date", y="total_amount", color="#ff6b00")

# Chat
with st.sidebar:
    st.markdown("---")
    st.subheader("💬 Invoice Agent")
    
    if "messages" not in st.session_state:
        st.session_state.messages = [{"role": "assistant", "content": "Ask me about your spending!"}]

    for msg in st.session_state.messages:
        st.chat_message(msg["role"]).write(msg["content"])

    if prompt := st.chat_input("Ask a question..."):
        st.session_state.messages.append({"role": "user", "content": prompt})
        st.chat_message("user").write(prompt)
        
        if not api_key:
            response = "Please enter API Key."
        else:
            context = [{"date": str(i['date']), "vendor": i['vendor'], "total": i['total_amount'], "category": i['category']} for i in invoices]
            with st.spinner("Thinking..."):
                response = gemini_service.chat_with_data(prompt, context, api_key)
        
        st.session_state.messages.append({"role": "assistant", "content": response})
        st.chat_message("assistant").write(response)
