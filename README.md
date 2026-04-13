# PalmID — Gesture Biometric Authentication

PalmID is a state-of-the-art gesture-based biometric authentication system. It uses **MediaPipe Hands** for real-time skeletal landmark tracking and a **FastAPI/SQLite** backend to provide secure, persistent enrollment and authentication.

## Project Preview

| Dashboard & Interaction | Authentication & Enrollment |
| :---: | :---: |
| ![Dashboard](Proof/Screenshot%201.png) | ![Authentication](Proof/Screenshot%202.png) |
| ![Settings](Proof/Screenshot%203.png) | ![Enrollment](Proof/Screenshot%204.png) |
| ![Audit Logs](Proof/Screenshot%205.png) | |

## Key Features

- **Biometric Enrollment**: Users can register unique gesture sequences (patterns) as their "password".
- **Real-time Detection**: 21-point hand landmark tracking via MediaPipe.
- **Persistent Backend**: FastAPI engine with SQLite database for storing users, audit logs, and system settings.
- **Audit Logs**: Full tamper-evident record of all authentication attempts (granted, denied, and lockouts).
- **Security Policies**: Configurable lockout duration, max failed attempts, and pattern strength requirements.
- **Rich UI**: High-fidelity dark/light mode interface with glassmorphism, particles, and micro-animations.

## Technology Stack

- **Frontend**: Vanilla JS, HTML5, CSS3, MediaPipe Hands.
- **Backend**: Python 3.10+, FastAPI, SQLAlchemy.
- **Database**: SQLite (Local file persistence).
- **Styling**: Modern CSS with CSS Variables and support for Dark Mode.

## Installation & Setup

### 1. Prerequisites
Ensure you have **Python 3.10+** installed.

### 2. Clone the Repository
```bash
git clone https://github.com/arpitpatel1364/PalmID.git
cd PalmID
```

### 3. Set Up Virtual Environment (Recommended)
```bash
python -m venv venv
# On Windows:
.\venv\Scripts\activate
# On Linux/macOS:
source venv/bin/activate
```

### 4. Install Dependencies
```bash
pip install -r backend/requirements.txt
```

### 5. Start the Application
```bash
python -m backend.main
```

The application will be available at: **[http://localhost:8000](http://localhost:8000)**

## Usage Guide

1. **Accessing the App**: Open the link above. You'll see a boot sequence and then the main dashboard.
2. **Enrolling a User**:
   - Go to the **ENROLL** tab.
   - Enter a display name and choose an avatar.
   - Perform gestures in front of the camera to build a pattern (min. 3 gestures).
   - Click **Save User**.
3. **Authenticating**:
   - Go to the **AUTH** tab.
   - Select your user from the dropdown.
   - Perform your secret gesture sequence.
   - Success will grant access and show the "Unlocked" screen.
4. **Monitoring logs**:
   - Check the **AUDIT** tab to see real-time login attempts and system events.

## Configuration
System settings like detection confidence and lockout timers can be adjusted directly in the **SETTINGS** tab and are persisted in the database.

## Future Enhancements

- **Multi-Factor Authentication (MFA)**: Integrate gesture patterns with secondary PIN or Email OTP for enhanced security.
- **Machine Learning Personalization**: Implement custom model training to adapt detection to a user's unique hand proportions and movement speed.
- **Mobile Companion App**: Develop a mobile interface for remote authentication and secure session management via smartphone.
- **Hardware Security Key Support**: Integrate WebAuthn to combine biometric gestures with physical FIDO2 security keys.
- **Advanced Pattern Encryption**: Implement salt-based hashing (e.g., Argon2) for storing gesture sequences to prevent database leaks.
- **Administrative Analytics**: Enhanced dashboard with authentication heatmaps, failure trend analysis, and automated threat detection.

## License
MIT License 