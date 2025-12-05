import { initializeApp } from "[https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js](https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js)";
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from "[https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js](https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js)";
import { getFirestore, doc, setDoc, collection, getDocs, query, setLogLevel } from "[https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js](https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js)";

// Enable Firebase debugging
setLogLevel('debug');

// --- GLOBAL VARIABLES (Provided by Canvas Environment) ---
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-efpbd-app-id';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const authToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

let db;
let auth;
let userId = null;
let isAuthReady = false;

const userIdDisplay = document.getElementById('userIdDisplay');
const profilePictureEl = document.getElementById('profilePicture');
const registrationForm = document.getElementById('registrationForm');
const registerButton = document.getElementById('registerButton');
const messageBox = document.getElementById('messageBox');
const authTrigger = document.getElementById('authTrigger');

// Default placeholder image for profile picture
const defaultPlaceholderUrl = '[https://placehold.co/60x60/E0F2F1/1D4ED8?text=P](https://placehold.co/60x60/E0F2F1/1D4ED8?text=P)';


/**
 * Converts the long Firebase UID into the requested "ASKR-..." format for display purposes.
 * The actual Firebase UID is still used for database operations.
 * @param {string} uid The full Firebase UID.
 * @returns {string} The shortened, formatted UID.
 */
function formatUserId(uid) {
    if (!uid || uid.length < 10) return 'UNASSIGNED-ID';
    // Use the first 4 chars + last 9 chars
    const prefix = uid.substring(0, 4).toUpperCase();
    const suffix = uid.slice(-9);
    return `${prefix}-${suffix}`;
}

/**
 * Initializes Firebase and authenticates the user.
 */
async function initializeFirebase() {
    try {
        if (Object.keys(firebaseConfig).length === 0) {
            throw new Error("Firebase configuration is missing.");
        }

        const app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        db = getFirestore(app);

        // Sign in with custom token or anonymously
        if (authToken) {
            await signInWithCustomToken(auth, authToken);
            console.log("Firebase signed in with custom token (Preferred).");
        } else {
            await signInAnonymously(auth);
            console.log("Firebase signed in anonymously (Fallback).");
        }

        // Listener for authentication state change
        onAuthStateChanged(auth, (user) => {
            if (user) {
                userId = user.uid;
                userIdDisplay.textContent = formatUserId(userId); // Display formatted UID
                isAuthReady = true;
                authTrigger.textContent = "Signed In (Active)";
                authTrigger.classList.remove('bg-blue-700');
                authTrigger.classList.add('bg-green-600', 'hover:bg-green-500');
                console.log("Authentication state changed. Full UID:", userId);
                checkRegistrationStatus(userId);
            } else {
                userId = null;
                userIdDisplay.textContent = "AUTH-ERROR-WAITING";
                isAuthReady = true;
                authTrigger.textContent = "Sign-In Failed";
                authTrigger.classList.remove('bg-blue-700');
                authTrigger.classList.add('bg-red-600', 'hover:bg-red-500');
                console.error("User not authenticated.");
            }
        });

    } catch (error) {
        console.error("Error initializing Firebase or authentication:", error);
        userIdDisplay.textContent = "FATAL-AUTH-ERROR.";
    }
}

/**
 * Checks if the current user has already registered.
 * @param {string} uid The current user's unique ID.
 */
async function checkRegistrationStatus(uid) {
    try {
        // Query private collection for existing registration
        const registrationSnap = await getDocs(query(collection(db, `artifacts/${appId}/users/${uid}/registrations`)));

        if (!registrationSnap.empty) {
            const data = registrationSnap.docs[0].data();
            displayMessage(`Welcome back, ${data.playerName}. Registration confirmed.`, 'text-blue-500');
            
            // Display and lock the form inputs
            document.getElementById('playerName').value = data.playerName;
            document.getElementById('contactNumber').value = data.contactNumber;
            document.getElementById('profilePictureUrl').value = data.profilePictureUrl || '';
            
            document.getElementById('playerName').disabled = true;
            document.getElementById('contactNumber').disabled = true;
            document.getElementById('profilePictureUrl').disabled = true;

            // Update the profile picture display
            profilePictureEl.src = data.profilePictureUrl || defaultPlaceholderUrl;
            profilePictureEl.onerror = () => profilePictureEl.src = defaultPlaceholderUrl; // Ensure fallback works

            registerButton.disabled = true;
            registerButton.textContent = "REGISTRATION CONFIRMED";
            registerButton.classList.remove('bg-blue-700');
            registerButton.classList.add('bg-green-600', 'hover:bg-green-500');
        } else {
            displayMessage("Please complete the form to secure your spot.", 'text-blue-700');
            registerButton.disabled = false;
        }
    } catch (error) {
        console.error("Error checking registration status:", error);
        displayMessage("Database status check failed.", 'text-gray-500');
    }
}

/**
 * Handles the registration form submission.
 * @param {Event} e The form submission event.
 */
async function handleRegistration(e) {
    e.preventDefault();

    if (!isAuthReady || !userId) {
        displayMessage("Authentication is still loading. Please wait a moment.", 'text-red-500');
        return;
    }

    registerButton.disabled = true;
    registerButton.textContent = "Processing...";

    const playerName = document.getElementById('playerName').value.trim();
    const contactNumber = document.getElementById('contactNumber').value.trim();
    const profilePictureUrl = document.getElementById('profilePictureUrl').value.trim();
    const platform = document.getElementById('platform').value;

    if (!playerName || !contactNumber || !profilePictureUrl) {
         displayMessage("All fields (including Profile Picture URL) are mandatory.", 'text-red-500');
         registerButton.disabled = false;
         registerButton.textContent = "Finalize Registration";
         return;
    }
    
    // Basic URL validation check (must start with http)
    if (!profilePictureUrl.startsWith('http')) {
        displayMessage("Profile Picture must be a valid public URL (start with http:// or https://).", 'text-red-500');
         registerButton.disabled = false;
         registerButton.textContent = "Finalize Registration";
         return;
    }


    const registrationData = {
        userId: userId,
        formattedPlayerId: formatUserId(userId),
        playerName: playerName,
        contactNumber: contactNumber,
        profilePictureUrl: profilePictureUrl,
        platform: platform, 
        registeredAt: new Date().toISOString()
    };

    try {
        // Store the registration in the user's private collection
        const registrationColRef = collection(db, `artifacts/${appId}/users/${userId}/registrations`);
        const docRef = doc(registrationColRef, 'efpbd_mobile_entry');
        
        await setDoc(docRef, registrationData);
        
        // Update profile picture element immediately after successful registration
        profilePictureEl.src = profilePictureUrl;
        profilePictureEl.onerror = () => profilePictureEl.src = defaultPlaceholderUrl; // Ensure fallback works

        displayMessage(`Registration successful for ${playerName}! Welcome to the tournament.`, 'text-green-600 font-bold');
        checkRegistrationStatus(userId); // Re-run to update UI/button
    } catch (error) {
        console.error("Error submitting registration:", error);
        displayMessage(`Registration failed: ${error.message}. Please try again.`, 'text-red-500');
        registerButton.disabled = false;
        registerButton.textContent = "Try Again";
    }
}

/**
 * Simple helper function to display messages.
 * @param {string} msg The message to display.
 * @param {string} className Tailwind class for color/style.
 */
function displayMessage(msg, className) {
    messageBox.textContent = msg;
    messageBox.className = `text-center text-sm mt-4 block font-semibold ${className}`;
    messageBox.classList.remove('hidden');
}


// --- Countdown Timer Logic ---
function updateCountdown() {
    // Target date set for a future date (e.g., end of year + 10 days)
    const targetDate = new Date(new Date().getFullYear() + 1, 0, 10).getTime();
    const now = new Date().getTime();
    const distance = targetDate - now;

    const days = Math.floor(distance / (1000 * 60 * 60 * 24));
    const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((distance % (1000 * 60)) / 1000);

    document.getElementById("days").textContent = String(days).padStart(2, '0');
    document.getElementById("hours").textContent = String(hours).padStart(2, '0');
    document.getElementById("minutes").textContent = String(minutes).padStart(2, '0');
    document.getElementById("seconds").textContent = String(seconds).padStart(2, '0');

    if (distance < 0) {
        clearInterval(countdownInterval);
        document.getElementById("countdown").innerHTML = '<p class="text-red-500 font-bold text-lg">REGISTRATION CLOSED!</p>';
        registerButton.disabled = true;
        registerButton.textContent = "Registration Closed";
        registerButton.classList.remove('bg-blue-700');
        registerButton.classList.add('bg-gray-500');
    }
}

// --- Event Listeners and Initial Calls ---
let countdownInterval;
window.addEventListener('load', () => {
    initializeFirebase();
    
    // Initialize Countdown Timer
    updateCountdown();
    countdownInterval = setInterval(updateCountdown, 1000);

    // Attach form handler
    registrationForm.addEventListener('submit', handleRegistration);
    
    // Mock Auth trigger handler
    authTrigger.addEventListener('click', (e) => {
        e.preventDefault();
        if (!isAuthReady) {
             authTrigger.textContent = "Checking Authentication...";
        }
    });
});
