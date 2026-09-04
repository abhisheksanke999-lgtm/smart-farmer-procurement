const translations = {
  en: {
    app_title: "Smart Farmer Procurement",
    app_subtitle: "Government Procurement & Queue Management",
    role_admin: "Government / Admin",
    role_dealer: "Procurement Dealer",
    role_farmer: "Farmer",
    
    // Navigation
    nav_home: "Home",
    nav_book_slot: "Book Slot",
    nav_my_token: "My Token / QR",
    nav_queue: "Live Queue",
    nav_receipts: "Receipts",
    nav_payments: "Payments",
    nav_scan_qr: "Scan QR Code",
    nav_approvals: "Dealer Approvals",
    nav_centres: "Centres",
    nav_dashboard: "Dashboard",
    nav_complaints: "Complaints",
    nav_logout: "Logout",
    
    // Status Badges
    status_email_verified: "Email Verified ✓",
    status_email_unverified: "Email Verification Required",
    status_resend_verification: "Resend Verification Link",
    status_approved: "Approved",
    status_pending: "Pending Approval",
    status_rejected: "Rejected",
    status_suspended: "Suspended",

    // OTP Verification
    otp_verification_title: "Verify Your Email",
    otp_sent_to: "OTP sent to your email",
    otp_enter_code: "Enter 6-Digit Verification Code",
    otp_verify_btn: "Verify OTP & Complete Registration",
    otp_resend_btn: "Resend OTP",
    otp_expires_in: "Code expires in",
    otp_expired_msg: "OTP has expired. Please request a new code.",
    otp_attempts_left: "attempts remaining",
    otp_change_email: "Change email / Back to registration",
    otp_resend_wait: "Resend available in",
    
    // Farmer Dashboard
    welcome_farmer: "Welcome, Farmer",
    book_slot_title: "Book Procurement Slot",
    select_centre: "Select Procurement Centre",
    select_date: "Select Date",
    select_slot: "Select Time Slot",
    select_crop: "Select Crop / Produce",
    enter_quantity: "Expected Quantity (Quintals)",
    confirm_booking: "Confirm Slot Booking",
    capacity_available: "Slots Available",
    capacity_full: "SLOT FULL",
    
    // QR & Token
    digital_token: "Digital Token",
    your_token: "YOUR TOKEN",
    show_qr_code: "Show QR Code at Centre",
    download_token: "Download Token Slip",
    print_token: "Print Token",
    
    // Queue Status
    live_queue_title: "Real-Time Centre Queue",
    current_token_serving: "Current Token Serving",
    farmers_ahead: "Farmers Ahead of You",
    est_wait_time: "Estimated Wait Time",
    minutes: "Minutes",
    turn_approaching: "Your turn is approaching! Please be ready near the weighbridge.",
    
    // Dealer Dashboard
    welcome_dealer: "Welcome, Dealer / Buyer",
    scan_farmer_qr: "Scan Farmer QR Code",
    camera_scan: "Scan via Camera",
    manual_input: "Enter Booking Code / Token",
    validate_code: "Validate Booking",
    valid_booking: "VALID BOOKING ✓",
    invalid_booking: "INVALID / EXPIRED / ALREADY USED",
    enter_weighment: "Enter Procurement Weighment",
    actual_quantity: "Actual Quantity (Quintals)",
    quality_grade: "Quality Grade",
    rate_per_quintal: "Rate per Quintal (₹)",
    total_amount: "Total Amount (₹)",
    weighment_slip: "Weighment Slip Number",
    submit_procurement: "Confirm & Complete Procurement",

    // Receipts & Payments
    digital_receipt: "Digital Procurement Receipt",
    receipt_no: "Receipt / Slip No",
    payment_status: "Payment Status",
    payment_pending: "PAYMENT PENDING",
    payment_completed: "PAYMENT COMPLETED ✓",
    payment_dbt: "Direct Bank Transfer (DBT)",
    bank_utr: "Bank UTR Ref",

    // Admin Dashboard
    admin_dashboard_title: "Government Executive Dashboard",
    total_farmers: "Registered Farmers",
    total_dealers: "Registered Dealers",
    pending_approvals: "Pending Dealer Approvals",
    active_centres: "Active Procurement Centres",
    today_bookings: "Today's Bookings",
    total_tonnage: "Procurement Tonnage (Q)",
    dealer_applications: "Dealer Registration Applications",
    approve_dealer: "Approve Dealer",
    reject_dealer: "Reject Dealer",
    suspend_dealer: "Suspend Dealer",
    process_dbt_payment: "Trigger DBT Direct Payout",

    // Common Buttons
    btn_close: "Close",
    btn_submit: "Submit",
    btn_cancel: "Cancel",
    btn_refresh: "Refresh"
  },
  te: {
    app_title: "స్మార్ట్ రైతు కొనుగోలు వ్యవస్థ",
    app_subtitle: "ప్రభుత్వ కొనుగోలు & క్యూ నిర్వహణ ప్లాట్‌ఫారమ్",
    role_admin: "ప్రభుత్వం / అడ్మిన్",
    role_dealer: "కొనుగోలు డీలర్",
    role_farmer: "రైతు",
    
    // Navigation
    nav_home: "ముఖ్య పేజీ",
    nav_book_slot: "స్లాట్ బుక్ చేయండి",
    nav_my_token: "నా టోకెన్ / క్యూఆర్",
    nav_queue: "లైవ్ క్యూ స్థితి",
    nav_receipts: "కొనుగోలు రసీదులు",
    nav_payments: "చెల్లింపుల వివరాలు",
    nav_scan_qr: "క్యూఆర్ స్కాన్ చేయండి",
    nav_approvals: "డీలర్ ఆమోదాలు",
    nav_centres: "కొనుగోలు కేంద్రాలు",
    nav_dashboard: "డాష్‌బోర్డ్",
    nav_complaints: "ఫిర్యాదులు",
    nav_logout: "నిష్క్రమించు",
    
    // Status Badges
    status_email_verified: "ఈమెయిల్ ధృవీకరించబడింది ✓",
    status_email_unverified: "ఈమెయిల్ ధృవీకరణ అవసరం",
    status_resend_verification: "ధృవీకరణ లింక్‌ను మళ్లీ పంపండి",
    status_approved: "ఆమోదించబడింది",
    status_pending: "ఆమోదం కోసం వేచి ఉంది",
    status_rejected: "తిరస్కరించబడింది",
    status_suspended: "నిలిపివేయబడింది",

    // OTP Verification
    otp_verification_title: "మీ ఈమెయిల్‌ను ధృవీకరించండి",
    otp_sent_to: "మీ ఈమెయిల్‌కు OTP పంపబడింది",
    otp_enter_code: "6-అంకెల ధృవీకరణ కోడ్‌ను నమోదు చేయండి",
    otp_verify_btn: "OTP ధృవీకరించి నమోదు పూర్తి చేయండి",
    otp_resend_btn: "మళ్లీ OTP పంపండి",
    otp_expires_in: "గడువు ముగిసే సమయం",
    otp_expired_msg: "OTP గడువు ముగిసింది. దయచేసి కొత్త కోడ్‌ను అభ్యర్థించండి.",
    otp_attempts_left: "ప్రయత్నాలు మిగిలి ఉన్నాయి",
    otp_change_email: "ఈమెయిల్ మార్చు / వివరాలు సవరించు",
    otp_resend_wait: "మళ్లీ పంపడానికి వేచి ఉండండి",
    
    // Farmer Dashboard
    welcome_farmer: "స్వాగతం, రైతు సోదరా",
    book_slot_title: "ధాన్యం కొనుగోలు స్లాట్ బుకింగ్",
    select_centre: "కొనుగోలు కేంద్రాన్ని ఎంచుకోండి",
    select_date: "తేదీని ఎంచుకోండి",
    select_slot: "సమయ స్లాట్‌ను ఎంచుకోండి",
    select_crop: "పంట రకాన్ని ఎంచుకోండి",
    enter_quantity: "అంచనా పరిమాణం (క్వింటాళ్లలో)",
    confirm_booking: "స్లాట్ బుకింగ్‌ను ధృవీకరించండి",
    capacity_available: "అందుబాటులో ఉన్న స్లాట్‌లు",
    capacity_full: "స్లాట్ నిండిపోయింది",
    
    // QR & Token
    digital_token: "డిజిటల్ టోకెన్",
    your_token: "మీ టోకెన్ నంబర్",
    show_qr_code: "కేంద్రం వద్ద ఈ క్యూఆర్ కోడ్ చూపించండి",
    download_token: "టోకెన్ స్లిప్ డౌన్‌లోడ్ చేయండి",
    print_token: "టోకెన్ ప్రింట్ చేయండి",
    
    // Queue Status
    live_queue_title: "రియల్ టైమ్ కేంద్రం క్యూ స్థితి",
    current_token_serving: "ప్రస్తుతం జరుగుతున్న టోకెన్",
    farmers_ahead: "మీ కంటే ముందున్న రైతులు",
    est_wait_time: "అంచనా సమయం",
    minutes: "నిమిషాలు",
    turn_approaching: "మీ వంతు దగ్గరపడుతోంది! వేబ్రిడ్జ్ వద్ద సిద్ధంగా ఉండండి.",
    
    // Dealer Dashboard
    welcome_dealer: "స్వాగతం, కొనుగోలు డీలర్",
    scan_farmer_qr: "రైతు క్యూఆర్ కోడ్‌ను స్కాన్ చేయండి",
    camera_scan: "కెమెరా ద్వారా స్కాన్ చేయండి",
    manual_input: "బుకింగ్ కోడ్ / టోకెన్ ఎంటర్ చేయండి",
    validate_code: "బుకింగ్‌ను తనిఖీ చేయండి",
    valid_booking: "చెల్లుబాటు అయ్యే బుకింగ్ ✓",
    invalid_booking: "చెల్లని / గడువు ముగిసిన / ఉపయోగించిన బుకింగ్",
    enter_weighment: "తూకం వివరాలు నమోదు చేయండి",
    actual_quantity: "నిజమైన పరిమాణం (క్వింటాళ్లు)",
    quality_grade: "నాణ్యత గ్రేడ్",
    rate_per_quintal: "క్వింటాల్ ధర (₹)",
    total_amount: "మొత్తం చెల్లింపు (₹)",
    weighment_slip: "వేబ్రిడ్జ్ స్లిప్ నంబర్",
    submit_procurement: "కొనుగోలు పూర్తి చేయండి",

    // Receipts & Payments
    digital_receipt: "డిజిటల్ కొనుగోలు రసీదు",
    receipt_no: "రసీదు / స్లిప్ నంబర్",
    payment_status: "చెల్లింపు స్థితి",
    payment_pending: "చెల్లింపు వేచి ఉంది",
    payment_completed: "చెల్లింపు పూర్తయింది ✓",
    payment_dbt: "ప్రత్యక్ష బ్యాంక్ బదిలీ (DBT)",
    bank_utr: "బ్యాంక్ UTR నంబర్",

    // Admin Dashboard
    admin_dashboard_title: "ప్రభుత్వ నిర్వహణ డాష్‌బోర్డ్",
    total_farmers: "నమోదైన రైతులు",
    total_dealers: "నమోదైన డీలర్లు",
    pending_approvals: "వేచి ఉన్న డీలర్ ఆమోదాలు",
    active_centres: "యాక్టివ్ కొనుగోలు కేంద్రాలు",
    today_bookings: "ఈరోజు బుకింగ్‌లు",
    total_tonnage: "మొత్తం కొనుగోలు (క్వింటాళ్లు)",
    dealer_applications: "డీలర్ రిజిస్ట్రేషన్ దరఖాస్తులు",
    approve_dealer: "డీలర్‌ను ఆమోదించండి",
    reject_dealer: "తిరస్కరించండి",
    suspend_dealer: "సస్పెండ్ చేయండి",
    process_dbt_payment: "DBT ద్వారా బ్యాంక్ బదిలీ చేయండి",

    // Common Buttons
    btn_close: "మూసివేయి",
    btn_submit: "సమర్పించు",
    btn_cancel: "రద్దు చేయి",
    btn_refresh: "రిఫ్రెష్"
  }
};

class I18nManager {
  constructor() {
    this.currentLang = localStorage.getItem("app_lang") || "en";
  }

  setLanguage(lang) {
    if (translations[lang]) {
      this.currentLang = lang;
      localStorage.setItem("app_lang", lang);
      document.dispatchEvent(new CustomEvent("languageChanged", { detail: { lang } }));
    }
  }

  t(key) {
    return translations[this.currentLang]?.[key] || translations["en"]?.[key] || key;
  }
}

const i18n = new I18nManager();
