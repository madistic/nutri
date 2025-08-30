import React, { useState, useRef, useEffect, createContext, useContext } from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, BarChart, Bar } from 'recharts';


// NEW: Firebase Authentication and Firestore Imports
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signOut, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendEmailVerification, signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc, collection, onSnapshot, addDoc, serverTimestamp, query, orderBy, updateDoc, deleteDoc, where, getDocs } from 'firebase/firestore';

// Existing Icon Imports
import { Calendar, Utensils, Activity, Droplet, History, Home, Loader2, PlusCircle, Trash2, Edit, Camera, Flame, Candy, ChevronDown, ChevronUp, Target, Sparkles, MessageSquare, Mic, Volume2, Zap, Crown, Globe, Users, ChevronRight, X, Play, Pause, Send, ArrowLeft, Bot, Menu, ChevronLeft, ChefHat, BarChart2, Scan, Database, TrendingUp, Lightbulb, Dumbbell, Repeat, NotebookPen, Calculator, Beef, ClipboardList, Tally3, Image as ImageIcon, MapPin, Cloudy, DollarSign, Search, Wind, Wheat, BrainCircuit, BookOpen, HeartPulse, ShoppingCart, HelpCircle, Sun, CloudRain, Snowflake, UserPlus, LogIn, LogOut } from 'lucide-react';

// Utility function for exponential backoff for API calls
async function retryWithExponentialBackoff(fn, retries = 5, delay = 1000) {
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (error) {
            if (i < retries - 1) {
                console.warn(`Retrying after error: ${error.message}. Attempt ${i + 1}/${retries}`);
                await new Promise(res => setTimeout(res, delay * Math.pow(2, i)));
            } else {
                throw error; // Re-throw if it's the last retry
            }
        }
    }
}

// Function to convert base64 PCM audio data to a WAV Blob
function pcmToWav(pcmData, sampleRate) {
    console.log("pcmToWav: received pcmData (ArrayBuffer) byteLength:", pcmData.byteLength, "sampleRate:", sampleRate);
    const pcm16 = new Int16Array(pcmData);
    console.log("pcmToWav: created Int16Array length:", pcm16.length);
    const dataLength = pcm16.length * 2;
    const buffer = new ArrayBuffer(44 + dataLength);
    const view = new DataView(buffer);

    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataLength, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // AudioFormat (1 for PCM)
    view.setUint16(22, 1, true); // NumChannels (1 for mono)
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true); // ByteRate (SampleRate * NumChannels * BitsPerSample/8)
    view.setUint16(32, 2, true); // BlockAlign (NumChannels * BitsPerSample/8)
    view.setUint16(34, 16, true); // BitsPerSample (16 for PCM16)
    writeString(view, 36, 'data');
    view.setUint32(40, dataLength, true);

    let offset = 44;
    for (let i = 0; i < pcm16.length; i++, offset += 2) {
        view.setInt16(offset, pcm16[i], true);
    }
    console.log("pcmToWav: WAV header and data written. Returning Blob.");
    return new Blob([view], { type: 'audio/wav' });
}

function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
}

function base64ToArrayBuffer(base64) {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    console.log("base64ToArrayBuffer: converted base64 to ArrayBuffer, length:", len);
    return bytes.buffer;
}

// Custom component to render the bot message with improved formatting and bullet points
const renderBotMessage = (text) => {
    const lines = text.split('\n');
    let elements = [];
    let listItems = [];
    let inList = false;

    const processBoldText = (line) => {
        const parts = line.split(/(\*\*.*?\*\*)/g);
        return parts.map((part, partIndex) => {
            if (part.startsWith('**') && part.endsWith('**')) {
                return <strong key={partIndex} className="font-bold text-gray-100">{part.slice(2, -2)}</strong>;
            }
            return part;
        });
    };

    lines.forEach((line, index) => {
        const trimmedLine = line.trim();

        if (trimmedLine === '---') {
            if (inList) {
                elements.push(<ul key={`list-${index - listItems.length}`} className="list-disc list-inside space-y-1 my-2 pl-4 text-gray-200">{listItems}</ul>);
                listItems = [];
                inList = false;
            }
            elements.push(<hr key={`hr-${index}`} className="my-6 border-purple-700/50" />);
            return;
        }

        if (trimmedLine.startsWith('* ') || trimmedLine.startsWith('- ')) {
            const content = trimmedLine.substring(2);
            listItems.push(
                <li key={`li-${index}`} className="flex items-start">
                    <div>{processBoldText(content)}</div>
                </li>
            );
            inList = true;
        } else {
            if (inList) {
                elements.push(<ul key={`list-${index - listItems.length}`} className="list-disc list-inside space-y-1 my-2 pl-4 text-gray-200">{listItems}</ul>);
                listItems = [];
                inList = false;
            }

            if (trimmedLine.match(/^[A-Z][a-zA-Z\s]+:/) && !trimmedLine.includes('**')) {
                if (lines[index + 1] && !(lines[index + 1].trim().startsWith('* ') || lines[index + 1].trim().startsWith('- '))) {
                     elements.push(<h4 key={`h4-${index}`} className="font-bold text-lg text-purple-300 mt-4 mb-2">{trimmedLine}</h4>);
                } else {
                    elements.push(<p key={`para-${index}`} className="font-semibold text-lg text-purple-300 mt-4 mb-2">{trimmedLine}</p>);
                }
            } else if (trimmedLine !== '') {
                 elements.push(<p key={`p-${index}`} className="text-base leading-relaxed text-gray-200 mb-2">{processBoldText(trimmedLine)}</p>);
            }
        }
    });

    if (inList) {
        elements.push(<ul key={`list-final`} className="list-disc list-inside space-y-1 my-2 pl-4 text-gray-200">{listItems}</ul>);
    }
    
    return elements;
};

const isSpeechRecognitionSupported = 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window;
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

// NEW: Login and Register components
const LoginPage = ({ onNavigate, onLogin, onGoogleLogin, onResendVerification }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    // New state to handle email verification message
    const [emailNeedsVerification, setEmailNeedsVerification] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setEmailNeedsVerification(false);
        try {
            await onLogin(email, password);
        } catch (err) {
            // Check for the specific error code for unverified emails
            if (err.code === 'auth/email-not-verified') {
                setEmailNeedsVerification(true);
            } else {
                setError(err.message);
            }
        }
    };

    return (
        <div className="p-8 text-center min-h-[500px] flex flex-col justify-center items-center">
            <LogIn className="w-20 h-20 text-purple-400 mb-6" />
            <h2 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-500 tracking-wide mb-4">
                Login
            </h2>
            <p className="text-gray-300 mb-6">Welcome back! Sign in to access your data.</p>
            {error && <div className="bg-red-800 bg-opacity-50 text-red-200 p-3 rounded-lg mb-4">{error}</div>}
            
            {emailNeedsVerification && (
                <div className="bg-yellow-800 bg-opacity-50 text-yellow-200 p-4 rounded-lg mb-4">
                    <p className="font-bold">Please verify your email address.</p>
                    <p className="text-sm mt-2">A verification email was sent. If you haven't received it, you can resend it below.</p>
                    <button
                        onClick={() => onResendVerification(email)}
                        className="mt-3 text-sm text-yellow-300 hover:text-yellow-100 underline"
                    >
                        Resend Verification Email
                    </button>
                </div>
            )}
            
            <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
                <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Email"
                    className="w-full p-3 rounded-xl bg-gray-700 border border-purple-600/50 text-white focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all duration-300"
                    required
                />
                <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Password"
                    className="w-full p-3 rounded-xl bg-gray-700 border border-purple-600/50 text-white focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all duration-300"
                    required
                />
                <button
                    type="submit"
                    className="w-full bg-gradient-to-r from-purple-600 to-pink-500 text-white p-3 rounded-xl shadow-lg hover:from-purple-700 hover:to-pink-600 transition-all duration-300 transform hover:scale-105 active:scale-95 font-bold"
                >
                    Sign In
                </button>
            </form>
            <div className="mt-4 text-sm text-gray-400">
                Don't have an account? <button onClick={() => onNavigate('register')} className="text-purple-400 hover:text-purple-300">Register</button>
            </div>
            <div className="flex items-center my-6 w-full max-w-sm">
                <div className="flex-grow border-t border-gray-600"></div>
                <span className="flex-shrink mx-4 text-gray-400">OR</span>
                <div className="flex-grow border-t border-gray-600"></div>
            </div>
            <button
                onClick={onGoogleLogin}
                className="w-full max-w-sm flex items-center justify-center p-3 rounded-xl bg-gray-700 text-white shadow-lg hover:bg-gray-600 transition-all duration-300 transform hover:scale-105 active:scale-95 font-bold"
            >
                <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google logo" className="w-5 h-5 mr-3" />
                Sign in with Google
            </button>
        </div>
    );
};

const RegisterPage = ({ onNavigate, onRegister, onGoogleLogin }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [verificationSent, setVerificationSent] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        if (password !== confirmPassword) {
            setError("Passwords do not match.");
            return;
        }
        try {
            await onRegister(email, password);
            setVerificationSent(true);
        } catch (err) {
            setError(err.message);
        }
    };

    return (
        <div className="p-8 text-center min-h-[500px] flex flex-col justify-center items-center">
            <UserPlus className="w-20 h-20 text-green-400 mb-6" />
            <h2 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-500 tracking-wide mb-4">
                Register
            </h2>
            <p className="text-gray-300 mb-6">Create your account to start tracking your health.</p>
            {error && <div className="bg-red-800 bg-opacity-50 text-red-200 p-3 rounded-lg mb-4">{error}</div>}
            {verificationSent ? (
                <div className="text-center p-6 rounded-xl bg-gray-700 border border-green-500">
                    <p className="text-lg text-green-400 mb-3">Verification Email Sent!</p>
                    <p className="text-gray-300">Please check your inbox and click the verification link. You can then log in on the login page.</p>
                    <button onClick={() => onNavigate('login')} className="mt-4 text-purple-400 hover:text-purple-300">
                        Go to Login
                    </button>
                </div>
            ) : (
                <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
                    <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="Email"
                        className="w-full p-3 rounded-xl bg-gray-700 border border-purple-600/50 text-white focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all duration-300"
                        required
                    />
                    <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Password"
                        className="w-full p-3 rounded-xl bg-gray-700 border border-purple-600/50 text-white focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all duration-300"
                        required
                    />
                    <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Confirm Password"
                        className="w-full p-3 rounded-xl bg-gray-700 border border-purple-600/50 text-white focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all duration-300"
                        required
                    />
                    <button
                        type="submit"
                        className="w-full bg-gradient-to-r from-green-600 to-teal-500 text-white p-3 rounded-xl shadow-lg hover:from-green-700 hover:to-teal-600 transition-all duration-300 transform hover:scale-105 active:scale-95 font-bold"
                    >
                        Register
                    </button>
                    <div className="flex items-center my-6 w-full max-w-sm">
                        <div className="flex-grow border-t border-gray-600"></div>
                        <span className="flex-shrink mx-4 text-gray-400">OR</span>
                        <div className="flex-grow border-t border-gray-600"></div>
                    </div>
                    <button
                        onClick={onGoogleLogin}
                        className="w-full max-w-sm flex items-center justify-center p-3 rounded-xl bg-gray-700 text-white shadow-lg hover:bg-gray-600 transition-all duration-300 transform hover:scale-105 active:scale-95 font-bold"
                    >
                        <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google logo" className="w-5 h-5 mr-3" />
                        Sign up with Google
                    </button>
                </form>
            )}
        </div>
    );
};


const ProfileModal = ({ onSubmit, onClose, userProfile }) => {
    const [name, setName] = useState(userProfile?.name || '');
    const [age, setAge] = useState(userProfile?.age || '');
    const [restrictions, setRestrictions] = useState(userProfile?.restrictions || '');
    const [goal, setGoal] = useState(userProfile?.goal || '');

    const handleSubmit = (e) => {
        e.preventDefault();
        onSubmit({ name, age, restrictions, goal });
    };

    return (
        <div className="absolute inset-0 bg-gray-900 bg-opacity-90 flex items-center justify-center p-4 z-50 animate-fade-in">
            <div className="bg-gray-800 bg-opacity-90 p-8 rounded-3xl shadow-2xl w-full max-w-md border border-purple-700/50">
                <div className="flex items-center justify-center mb-4 space-x-2">
                    <ChefHat className="w-8 h-8 text-purple-400" />
                    <h2 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-500">
                        Tell us about yourself
                    </h2>
                </div>
                <p className="text-gray-300 mb-6 text-sm text-center">
                    This information helps NutriBot give you personalized advice. All data is stored securely.
                </p>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-gray-400 text-sm mb-1" htmlFor="name">Name</label>
                        <input
                            type="text"
                            id="name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full p-3 rounded-xl bg-gray-700 border border-purple-600/50 text-white focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all duration-300"
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-gray-400 text-sm mb-1" htmlFor="age">Age</label>
                        <input
                            type="number"
                            id="age"
                            value={age}
                            onChange={(e) => setAge(e.target.value)}
                            className="w-full p-3 rounded-xl bg-gray-700 border border-purple-600/50 text-white focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all duration-300"
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-gray-400 text-sm mb-1" htmlFor="restrictions">Dietary Restrictions (e.g., vegan, gluten-free)</label>
                        <input
                            type="text"
                            id="restrictions"
                            value={restrictions}
                            onChange={(e) => setRestrictions(e.target.value)}
                            className="w-full p-3 rounded-xl bg-gray-700 border border-purple-600/50 text-white focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all duration-300"
                        />
                    </div>
                    <div>
                        <label className="block text-gray-400 text-sm mb-1" htmlFor="goal">Health Goal (e.g., lose weight, build muscle)</label>
                        <input
                            type="text"
                            id="goal"
                            value={goal}
                            onChange={(e) => setGoal(e.target.value)}
                            className="w-full p-3 rounded-xl bg-gray-700 border border-purple-600/50 text-white focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all duration-300"
                        />
                    </div>
                    <div className="flex justify-end space-x-2 mt-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="bg-gray-600 text-white p-3 rounded-xl shadow-lg hover:bg-gray-700 transition-all duration-300"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="bg-gradient-to-r from-purple-600 to-pink-500 text-white p-3 rounded-xl shadow-lg hover:from-purple-700 hover:to-pink-600 transition-all duration-300 transform hover:scale-105 active:scale-95"
                        >
                            Save Profile
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

const HomePage = ({ onNavigate }) => (
    <div className="p-8 text-center min-h-[500px] flex flex-col justify-center items-center">
        <Sparkles className="w-20 h-20 text-yellow-300 mb-6 animate-pulse" />
        <h2 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-500 tracking-wide mb-4">
            Welcome to NutriBot AI
        </h2>
        <p className="text-gray-300 mb-10 max-w-xl">
            Your personal AI-powered nutrition assistant. Get personalized advice, track your goals, and discover a world of healthy eating.
        </p>

        <div className="flex flex-col sm:flex-row space-y-4 sm:space-y-0 sm:space-x-4">
            <button
                onClick={() => onNavigate('chat')}
                className="group bg-gradient-to-r from-purple-600 to-pink-500 text-white p-4 rounded-xl font-bold shadow-lg transition-all duration-300 transform hover:scale-105 active:scale-95 flex items-center justify-center space-x-2"
            >
                <MessageSquare className="w-5 h-5 group-hover:animate-pulse" />
                <span>Start Chatting</span>
            </button>
            <button
                onClick={() => onNavigate('features')}
                className="group bg-gray-700 text-white p-4 rounded-xl font-bold shadow-lg hover:bg-gray-600 transition-all duration-300 transform hover:scale-105 active:scale-95 flex items-center justify-center space-x-2"
            >
                <Crown className="w-5 h-5 group-hover:animate-bounce" />
                <span>View Features</span>
            </button>
        </div>
    </div>
);

const FeaturesPage = ({ onGoBack }) => {
    const FeatureExample = ({ example }) => (
        <div className="mt-4 p-3 bg-gray-700/50 rounded-lg border border-purple-600/30">
            <p className="text-xs text-purple-300 font-semibold mb-1">Example:</p>
            <p className="text-xs text-gray-300">
                <span className="font-bold text-pink-400">User asks:</span> "{example.prompt}"
            </p>
            <p className="text-xs text-gray-300 mt-1">
                <span className="font-bold text-teal-400">AI explains:</span> "{example.response}"
            </p>
        </div>
    );

    const featureCards = [
        {
            title: "Free Features",
            icon: Sparkles,
            color: "text-purple-400",
            borderColor: "border-purple-600/50",
            bgColor: "bg-gray-800",
            features: [
                { name: "Basic AI-powered food tracking", description: "The app uses AI to recognize food from a photo, though the accuracy may be limited.", icon: Camera },
                { name: "Basic nutritional breakdown", description: "Provides some calorie and macronutrient information for meals.", icon: Tally3 },
                { name: "Lifestyle questions", description: "The app may ask for some information to build a basic plan.", icon: ClipboardList },
            ]
        },
        {
            title: "Premium Features",
            icon: Crown,
            color: "text-yellow-400",
            borderColor: "border-yellow-600/50",
            bgColor: "bg-gray-800",
            features: [
                { name: "AI Recipe from Image", description: "Upload a photo of your ingredients and get personalized recipe suggestions.", icon: ImageIcon },
                { name: "Advanced AI-powered food tracking", description: "More accurate and reliable AI recognition of meals, including complex dishes.", icon: Camera },
                { name: "Comprehensive nutritional analysis", description: "Detailed breakdowns of calories, protein, carbs, and fat.", icon: BarChart2 },
                { name: "Barcode scanner", description: "Scan barcodes on packaged foods for instant nutritional information.", icon: Scan },
                { name: "Food database", description: "Access to an extensive database of over 1 million foods.", icon: Database },
                { name: "Progress tracking", description: "Monitor weight, body measurements, and nutrition goals over time.", icon: TrendingUp },
                { name: "AI suggestions", description: "Personalized recommendations to help users stay on track.", icon: Lightbulb },
                { name: "Water and exercise tracking", description: "Log water intake and daily exercise.", icon: Droplet },
                { name: "Food memory", description: "The app remembers frequently logged meals for easy re-logging.", icon: NotebookPen },
                { name: "Calorie deficit calculator", description: "A tool to help users manage their calorie deficit for weight loss.", icon: Calculator },
                { name: "Macros and protein tracker", description: "Dedicated tools for monitoring and optimizing macronutrient intake.", icon: Beef },
                { name: "Rollover calories", description: "Roll over unused calories from one day to the next for flexibility.", icon: Repeat },
                { name: "Indian City Food Suggestions", description: "Select a city to get recommendations on popular local dishes and foods.", icon: Utensils },
                { name: "Weather-Based Food Suggestions", description: "Get food and drink ideas based on your local weather.", icon: Cloudy },
                { 
                    name: "Smart Grocery List & Meal Prep", 
                    description: "Auto-generate grocery lists from meal plans and optimize your shopping and prep time.", 
                    icon: ShoppingCart,
                    example: { prompt: "Create a 3-day low-carb meal plan.", response: "AI generates a plan and a categorized grocery list, noting ingredients you already have..." }
                },
                { 
                    name: "Cultural Food Explorer", 
                    description: "Translate and adapt international dishes to your local, healthy preferences.", 
                    icon: Globe,
                    example: { prompt: "Convert Japanese bento to an Indian diabetic-friendly lunch.", response: "AI explains the bento concept and provides a recipe for a balanced Indian thali with similar principles..." }
                },
                { 
                    name: "Symptom-Based Food Recommendations", 
                    description: "Get suggestions on what to eat based on your health symptoms or mood.", 
                    icon: HeartPulse,
                    example: { prompt: "I have a headache and feel bloated.", response: "AI suggests hydrating foods like cucumber and ginger tea, explaining why they help..." }
                },
                { 
                    name: "Nutrition Myth Buster", 
                    description: "Get science-backed answers to common nutrition myths and questions.", 
                    icon: BookOpen,
                    example: { prompt: "Is ghee unhealthy?", response: "Actually, in moderation, ghee provides Conjugated Linoleic Acid (CLA) and is a source of fat-soluble vitamins..." }
                },
            ],
            isPremium: true
        }
    ];

    const pricingTiers = [
        { name: "Basic", price: "Free", description: "All core features.", features: ["Basic Food Tracking", "Nutritional Breakdown", "Lifestyle Questions"] },
        { name: "Premium", price: "$9.99/mo", description: "Unlocks all features.", features: ["Everything in Basic", "AI Recipe from Image", "Advanced Tracking", "Barcode Scanner", "Food Database", "Progress Tracking", "AI Suggestions", "And much more!"] },
    ];

    return (
        <div className="p-4 md:p-8 text-center min-h-[500px] flex flex-col justify-start items-center overflow-y-auto custom-scrollbar">
            <h2 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-500 tracking-wide mb-4">
                Our Features
            </h2>
            <p className="text-gray-300 mb-10 max-w-xl">
                Discover the power of NutriBot AI. Upgrade to premium for an even more personalized and comprehensive experience.
            </p>

            <div className="grid md:grid-cols-2 gap-8 w-full max-w-6xl">
                {featureCards.map((card, index) => (
                    <div key={index} className={`p-6 md:p-8 rounded-3xl shadow-xl border ${card.borderColor} ${card.bgColor} transition-all duration-300 hover:scale-105 flex flex-col`}>
                        <div className="flex items-center justify-center space-x-4 mb-6">
                            <card.icon className={`w-10 h-10 ${card.color}`} />
                            <h3 className={`text-3xl font-bold ${card.color}`}>{card.title}</h3>
                        </div>
                        <ul className="space-y-6">
                            {card.features.map((feature, idx) => (
                                <li key={idx} className="flex items-start text-left">
                                    <feature.icon className={`w-6 h-6 flex-shrink-0 ${card.color} mt-1 mr-4`} />
                                    <div>
                                        <h4 className="text-lg font-semibold text-gray-200">{feature.name}</h4>
                                        <p className="text-sm text-gray-400 mt-1">{feature.description}</p>
                                        {feature.example && <FeatureExample example={feature.example} />}
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </div>
                ))}
            </div>

            <h3 className="text-3xl font-bold text-white mt-12 mb-6">Pricing Plans</h3>
            <div className="grid sm:grid-cols-2 gap-8 w-full max-w-2xl">
                {pricingTiers.map((tier, index) => (
                    <div key={index} className="p-6 rounded-2xl border border-gray-700 bg-gray-800 shadow-lg">
                        <div className="flex items-center space-x-2 mb-4">
                            <DollarSign className="w-8 h-8 text-green-400" />
                            <h4 className="text-2xl font-bold text-gray-100">{tier.name}</h4>
                        </div>
                        <p className="text-4xl font-extrabold text-white mb-2">{tier.price}</p>
                        <p className="text-sm text-gray-400 mb-6">{tier.description}</p>
                        <ul className="space-y-2 text-left">
                            {tier.features.map((feat, idx) => (
                                <li key={idx} className="flex items-center text-gray-200">
                                    <ChevronRight className="w-4 h-4 mr-2 text-pink-400" />
                                    <span>{feat}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                ))}
            </div>

            <button
                onClick={onGoBack}
                className="mt-12 text-gray-400 hover:text-purple-400 transition-colors flex items-center space-x-2"
            >
                <ArrowLeft className="w-5 h-5" />
                <span>Back to Home</span>
            </button>
        </div>
    );
};

// Updated AnalyzingLoader component with more engaging animations
const AnalyzingLoader = ({ isImage = false }) => (
    <div className="flex justify-start mb-4 animate-fade-in items-start">
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center mr-2 shadow-md">
            <Bot className="w-5 h-5 text-white" />
        </div>
        <div className="max-w-[75%] p-4 rounded-2xl bg-indigo-900 bg-opacity-70 text-white rounded-bl-none shadow-lg relative overflow-hidden"
             style={{
                 border: '1px solid rgba(255, 255, 255, 0.1)',
                 boxShadow: '0 0 10px rgba(0, 255, 255, 0.2)',
                 animation: 'pulse-glow 5s infinite',
             }}>
            <div className="flex items-center space-x-2 text-sm">
                <span className="text-sm font-bold text-transparent bg-clip-text bg-gradient-to-r from-teal-400 to-cyan-500" style={{ animation: 'flicker 1s infinite alternate' }}>
                    {isImage ? 'Analyzing your ingredients...' : 'Analyzing your request...'}
                </span>
                <div className="visualizer flex items-end h-4 gap-1">
                    <div className="bar h-2 w-1.5 rounded-full" style={{ background: 'linear-gradient(to top, #00f2f2, #00c7e2)', animation: 'bar-animation 1s infinite alternate ease-in-out', animationDelay: '0.0s' }}></div>
                    <div className="bar h-3 w-1.5 rounded-full" style={{ background: 'linear-gradient(to top, #ff00ff, #8a2be2)', animation: 'bar-animation 1s infinite alternate ease-in-out', animationDelay: '0.2s' }}></div>
                    <div className="bar h-5 w-1.5 rounded-full" style={{ background: 'linear-gradient(to top, #00ff8c, #00e572)', animation: 'bar-animation 1s infinite alternate ease-in-out', animationDelay: '0.4s' }}></div>
                    <div className="bar h-2 w-1.5 rounded-full" style={{ background: 'linear-gradient(to top, #00f2f2, #00c7e2)', animation: 'bar-animation 1s infinite alternate ease-in-out', animationDelay: '0.6s' }}></div>
                </div>
            </div>
        </div>
    </div>
);

// New component to display nutrient facts
const NutrientFacts = ({ fact }) => {
    return (
        <div className="w-full max-w-[85%] mt-4 p-4 rounded-2xl bg-gray-800 bg-opacity-70 border border-purple-600/50 shadow-lg flex flex-col space-y-4 animate-fade-in self-start ml-12">
            <h2 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-teal-400 to-cyan-500 text-center">
                Did You Know...?
            </h2>
            {!fact ? (
                <div className="text-center text-gray-400">
                    <p>Fetching an amazing fact...</p>
                </div>
            ) : (
                <div className="space-y-3">
                    <div
                        className="p-3 rounded-xl bg-gray-700/50 border border-teal-500/30 shadow-sm text-gray-200 text-sm leading-relaxed animate-fade-in"
                    >
                        <p>{fact.fact}</p>
                    </div>
                </div>
            )}
        </div>
    );
};

// NEW Indian City Food Suggestions Component
const CityFoodSuggestionsComponent = ({ onGoBack }) => {
    const [selectedCity, setSelectedCity] = useState('');
    const [suggestions, setSuggestions] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);

   const indianCities = [
      "Agra", "Ahmedabad", "Amritsar", "Bengaluru (Bangalore)", "Chennai", "Delhi", "Goa", "Hyderabad", "Jaipur", "Kolkata", "Lucknow", "Mumbai", "Pune", "Varanasi"
    ];
    
    const featuredCities = ["Mumbai", "Delhi", "Bengaluru", "Kolkata"];

    const getSuggestions = async (city) => {
        if (!city) {
            setError("Please select a city first.");
            return;
        }
        setSelectedCity(city);
        setIsLoading(true);
        setError(null);
        setSuggestions(null);

        try {
            const generatedSuggestions = await generateFoodSuggestions(city);
            setSuggestions(generatedSuggestions);
        } catch (err) {
            console.error(err);
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    const generateFoodSuggestions = async (city) => {

       

        const prompt = `Act as a travel and food blogger. Provide a detailed summary of the best dishes, popular street foods, and famous restaurants or food experiences in and around ${city}, India. Also include a brief note on the unique culinary style of the region. Please use clear headings and bullet points to format the response.`;

        let chatHistory = [];
        chatHistory.push({ role: "user", parts: [{ text: prompt }] });
        const payload = { contents: chatHistory };
        const apiKey = "";
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;

        const makeApiCall = async () => {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (!response.ok) {
                throw new Error(` failed with status: ${response.status}`);
            }
            return await response.json();
        };

        const responseData = await retryWithExponentialBackoff(makeApiCall);

        if (responseData && responseData.candidates && responseData.candidates.length > 0 &&
            responseData.candidates[0].content && responseData.candidates[0].content.parts &&
            responseData.candidates[0].content.parts.length > 0) {
            const text = responseData.candidates[0].content.parts[0].text;
            return text;
        } else {
            throw new Error("Failed to get a valid response from the API.");
        }
    };

    return (
        <div className="p-6 flex flex-col h-[500px] relative">
            <div className="flex items-center justify-between border-b border-purple-700/50 pb-4 mb-4">
                <button onClick={onGoBack} className="text-gray-400 hover:text-purple-400 transition-colors">
                    <ChevronLeft size={24} />
                </button>
                <h2 className="text-xl font-semibold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-500 flex items-center space-x-2">
                    <Utensils size={24} className="text-yellow-400" />
                    <span>Indian City Food Guide</span>
                </h2>
                <div className="w-6"></div>
            </div>
            
            <div className="flex-grow overflow-y-auto custom-scrollbar mb-4 flex flex-col items-center justify-center text-center">
                {!suggestions && !isLoading && !error && (
                    <div className="flex flex-col items-center space-y-6 animate-fade-in">
                        <MapPin className="w-16 h-16 text-purple-400 animate-pulse" />
                        <p className="text-gray-300 max-w-sm">
                            Select an Indian city to get food recommendations and a guide to its culinary scene.
                        </p>
                        <div className="w-full max-w-xs flex flex-col space-y-4">
                            <select
                                value={selectedCity}
                                onChange={(e) => getSuggestions(e.target.value)}
                                className="w-full p-3 rounded-full bg-gray-700 text-white border border-purple-600/50 focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all duration-300"
                            >
                                <option value="" disabled>Select a City</option>
                                {indianCities.map(city => (
                                    <option key={city} value={city}>{city}</option>
                                ))}
                            </select>
                        </div>
                         <div className="w-full max-w-xs">
                            <p className="text-gray-400 text-sm mb-2">Or try a featured city:</p>
                            <div className="grid grid-cols-2 gap-3">
                                {featuredCities.map(city => (
                                    <button key={city} onClick={() => getSuggestions(city)} className="bg-gray-700/80 text-gray-200 px-4 py-2 rounded-full hover:bg-gray-600 transition-colors shadow-md">
                                        {city}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
                {isLoading && (
                    <div className="flex flex-col items-center space-y-4">
                        <div className="animate-spin h-10 w-10 text-purple-400">
                            <Sparkles size={40} />
                        </div>
                        <p className="text-gray-300">Searching for food and restaurant recommendations...</p>
                    </div>
                )}
                {error && (
                    <div className="p-4 bg-red-800 bg-opacity-50 text-red-200 rounded-xl shadow-lg border border-red-700">
                        <p className="font-bold">Error:</p>
                        <p>{error}</p>
                    </div>
                )}
                {suggestions && (
                    <div className="w-full text-left animate-fade-in p-4 bg-gray-700 bg-opacity-50 rounded-xl shadow-lg border border-purple-600/50">
                        <h3 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-500 mb-2">
                            A Culinary Guide to {selectedCity}
                        </h3>
                        <div className="prose prose-invert max-w-none bot-prose"> {/* Added bot-prose here */}
                            {renderBotMessage(suggestions)}
                        </div>
                    </div>
                )}
            </div>
            {suggestions && (
                <div className="mt-4 flex justify-center">
                    <button
                        onClick={() => { setSuggestions(null); setSelectedCity(''); }}
                        className="bg-gray-600 text-white p-3 rounded-full shadow-lg hover:bg-gray-700 transition-all duration-300 transform hover:scale-105 active:scale-95"
                    >
                        Choose another city
                    </button>
                </div>
            )}
        </div>
    );
};

// NEW Food Lookup Component
const FoodLookupPage = ({ onGoBack }) => {
    const [query, setQuery] = useState('');
    const [suggestions, setSuggestions] = useState([]);
    const [foodData, setFoodData] = useState(null); // For single search result
    const [initialItems, setInitialItems] = useState([]); // For default items
    const [isLoading, setIsLoading] = useState(false);
    const [isInitialLoading, setIsInitialLoading] = useState(true);
    const [error, setError] = useState(null);

    const foodDatabase = [
        "Apple", "Avocado", "Almonds", "Asparagus", "Banana", "Broccoli", "Blueberries", "Beef", "Beans", "Bread",
        "Chicken Breast", "Carrot", "Cauliflower", "Cheese", "Chia Seeds", "Cucumber", "Dates", "Duck", "Egg", "Edamame",
        "Fish (Salmon)", "Flax Seeds", "Grapes", "Greek Yogurt", "Green Beans", "Honey", "Hummus", "Kale", "Kiwi", "Lamb",
        "Lentils", "Lettuce", "Mango", "Milk", "Mushrooms", "Oats", "Olive Oil", "Onion", "Orange", "Pasta", "Peanut Butter",
        "Pear", "Peas", "Pineapple", "Pork", "Potato", "Quinoa", "Raspberries", "Rice", "Spinach", "Strawberries",
        "Sweet Potato", "Tomato", "Tuna", "Turkey", "Walnuts", "Watermelon", "Yogurt", "Zucchini"
    ];

    const getNutritionalInfo = async (foodItem) => {
        const prompt = `Provide a detailed nutritional breakdown for 100g of "${foodItem}". Include values for Calories, Protein, Carbohydrates, Sugar, Fat, and Fiber.`;
        const chatHistory = [{ role: "user", parts: [{ text: prompt }] }];

        const responseSchema = {
            type: "OBJECT",
            properties: {
                "foodName": { "type": "STRING" },
                "servingSize": { "type": "STRING", "description": "e.g., 100g" },
                "calories": { "type": "STRING" },
                "protein": { "type": "STRING" },
                "carbohydrates": { "type": "STRING" },
                "sugar": { "type": "STRING" },
                "fat": { "type": "STRING" },
                "fiber": { "type": "STRING" },
            },
            required: ["foodName", "servingSize", "calories", "protein", "carbohydrates", "fat"]
        };

        const payload = {
            contents: chatHistory,
            generationConfig: {
                responseMimeType: "application/json",
                responseSchema: responseSchema
            }
        };

           const apiKey = "";
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;
        const response = await retryWithExponentialBackoff(async () => {
            const res = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (!res.ok) throw new Error(`API error: ${res.status}`);
            return res.json();
        });

        if (response.candidates && response.candidates.length > 0) {
            const jsonText = response.candidates[0].content.parts[0].text;
            return JSON.parse(jsonText);
        } else {
            throw new Error(`No nutritional data found for ${foodItem}.`);
        }
    };
    
    useEffect(() => {
        const fetchInitialItems = async () => {
            setIsInitialLoading(true);
            const defaultFoods = ["Apple", "Avocado", "Chicken Breast", "Broccoli"];
            try {
                const promises = defaultFoods.map(food => getNutritionalInfo(food));
                const results = await Promise.all(promises);
                setInitialItems(results);
            } catch (err) {
                console.error("Failed to fetch initial food items:", err);
                setError("Could not load initial food data. Please check your connection.");
            } finally {
                setIsInitialLoading(false);
            }
        };
        fetchInitialItems();
    }, []);

    const handleInputChange = (e) => {
        const value = e.target.value;
        setQuery(value);
        if (value.length > 1) {
            const filteredSuggestions = foodDatabase.filter(food =>
                food.toLowerCase().includes(value.toLowerCase())
            );
            setSuggestions(filteredSuggestions);
        } else {
            setSuggestions([]);
        }
    };

    const fetchAndSetSingleFood = async (foodItem) => {
        setIsLoading(true);
        setError(null);
        setFoodData(null);
        try {
            const data = await getNutritionalInfo(foodItem);
            setFoodData(data);
        } catch (err)
 {
            setError(err.message || `Could not fetch data for ${foodItem}.`);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSuggestionClick = (suggestion) => {
        setQuery(suggestion);
        setSuggestions([]);
        fetchAndSetSingleFood(suggestion);
    };

    const handleSearch = () => {
        if (!query) return;
        setSuggestions([]);
        fetchAndSetSingleFood(query);
    };

    const NutrientCard = ({ icon, label, value, color }) => (
        <div className="bg-gray-700 bg-opacity-70 p-4 rounded-2xl flex flex-col items-center justify-center text-center shadow-lg border border-purple-600/30">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-3 ${color}`}>
                {icon}
            </div>
            <p className="text-sm text-gray-300">{label}</p>
            <p className="text-xl font-bold text-white">{value || 'N/A'}</p>
        </div>
    );
    
    const InitialFoodItemCard = ({ item, onClick }) => (
        <button onClick={onClick} className="bg-gray-700 bg-opacity-50 p-4 rounded-2xl shadow-lg border border-purple-600/30 w-full animate-fade-in text-left hover:bg-gray-700 transition-colors">
            <h4 className="text-lg font-bold text-center text-transparent bg-clip-text bg-gradient-to-r from-teal-400 to-cyan-500 mb-3">{item.foodName}</h4>
            <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                    <p className="text-xs text-gray-400">Calories</p>
                    <p className="font-semibold text-white">{item.calories.split(' ')[0]}</p>
                </div>
                <div>
                    <p className="text-xs text-gray-400">Protein</p>
                    <p className="font-semibold text-white">{item.protein}</p>
                </div>
                <div>
                    <p className="text-xs text-gray-400">Carbs</p>
                    <p className="font-semibold text-white">{item.carbohydrates}</p>
                </div>
            </div>
        </button>
    );

    return (
        <div className="p-6 flex flex-col h-[500px]">
            <div className="flex items-center justify-between border-b border-purple-700/50 pb-4 mb-4">
                <button onClick={onGoBack} className="text-gray-400 hover:text-purple-400 transition-colors">
                    <ChevronLeft size={24} />
                </button>
                <h2 className="text-xl font-semibold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-500 flex items-center space-x-2">
                    <Database size={24} className="text-teal-400" />
                    <span>Food Lookup</span>
                </h2>
                <div className="w-6"></div>
            </div>

            <div className="relative mb-4">
                <div className="flex items-center space-x-2">
                    <input
                        type="text"
                        value={query}
                        onChange={handleInputChange}
                        placeholder="E.g., 'Apple' or 'Chicken Breast'"
                        className="flex-grow p-3 rounded-full bg-gray-700 bg-opacity-80 border border-purple-600/50 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all duration-300 shadow-inner"
                    />
                    <button
                        onClick={handleSearch}
                        className="bg-gradient-to-r from-purple-600 to-pink-500 text-white p-3 rounded-full shadow-lg hover:from-purple-700 hover:to-pink-600 transition-all duration-300 transform hover:scale-105 active:scale-95"
                    >
                        <Search className="w-6 h-6" />
                    </button>
                </div>
                {suggestions.length > 0 && (
                    <ul className="absolute z-10 w-full bg-gray-800 border border-purple-600/50 rounded-xl mt-2 shadow-lg max-h-48 overflow-y-auto custom-scrollbar">
                        {suggestions.map((s, i) => (
                            <li
                                key={i}
                                onClick={() => handleSuggestionClick(s)}
                                className="p-3 hover:bg-purple-700/50 cursor-pointer text-gray-200"
                            >
                                {s}
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            <div className="flex-grow overflow-y-auto custom-scrollbar">
                {isLoading || isInitialLoading ? (
                     <div className="flex flex-col items-center justify-center h-full text-center">
                        <div className="animate-spin h-10 w-10 text-purple-400">
                            <Sparkles size={40} />
                        </div>
                        <p className="text-gray-300 mt-4">
                            {isLoading ? `Fetching data for ${query}...` : 'Loading popular foods...'}
                        </p>
                    </div>
                ) : error ? (
                     <div className="p-4 bg-red-800 bg-opacity-50 text-red-200 rounded-xl shadow-lg border border-red-700 text-center">
                        <p className="font-bold">Error:</p>
                        <p>{error}</p>
                    </div>
                ) : foodData ? (
                    <div className="animate-fade-in space-y-4">
                        <h3 className="text-2xl font-bold text-center text-transparent bg-clip-text bg-gradient-to-r from-teal-400 to-cyan-500">
                            {foodData.foodName} ({foodData.servingSize})
                        </h3>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                            <NutrientCard icon={<Flame size={24} className="text-white"/>} label="Calories" value={foodData.calories} color="bg-red-500" />
                            <NutrientCard icon={<Beef size={24} className="text-white"/>} label="Protein" value={foodData.protein} color="bg-blue-500" />
                            <NutrientCard icon={<Wind size={24} className="text-white"/>} label="Carbs" value={foodData.carbohydrates} color="bg-yellow-500" />
                            <NutrientCard icon={<Zap size={24} className="text-white"/>} label="Sugar" value={foodData.sugar} color="bg-pink-500" />
                            <NutrientCard icon={<Droplet size={24} className="text-white"/>} label="Fat" value={foodData.fat} color="bg-orange-500" />
                            <NutrientCard icon={<Wheat size={24} className="text-white"/>} label="Fiber" value={foodData.fiber} color="bg-green-500" />
                        </div>
                        <div className="text-center mt-4">
                             <button
                                onClick={() => { setFoodData(null); setQuery(''); }}
                                className="bg-gray-600 text-white p-3 rounded-full shadow-lg hover:bg-gray-700 transition-all duration-300 transform hover:scale-105 active:scale-95"
                            >
                                Search Another Food
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {initialItems.map((item, index) => (
                            <InitialFoodItemCard key={index} item={item} onClick={() => fetchAndSetSingleFood(item.foodName)} />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

// NEW Weather-Based Food Suggestions Component
const WeatherFoodSuggestions = ({ onGoBack }) => {
    const [location, setLocation] = useState('');
    const [weather, setWeather] = useState(null);
    const [suggestions, setSuggestions] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);

    const getMockWeather = (condition) => {
        const conditions = {
            "Hot Day": { temp: 32, condition: "Sunny", icon: "☀️" },
            "Rainy Day": { temp: 15, condition: "Rainy", icon: "🌧️" },
            "Cold Day": { temp: 8, condition: "Snowy", icon: "❄️" },
        };
        return conditions[condition] || conditions["Hot Day"];
    };
    
    const getSuggestions = async (loc, cond) => {
        if (!loc) {
            setError("Please enter a location.");
            return;
        }
        setLocation(loc);
        setIsLoading(true);
        setError(null);
        setSuggestions(null);

        try {
            const weatherData = getMockWeather(cond);
            setWeather(weatherData);

            const prompt = `The weather in ${loc} is a ${weatherData.condition} with a temperature around ${weatherData.temp}°C. Based on this, suggest some healthy and delicious food and drink ideas. Include breakfast, lunch, dinner, and a snack. Format the response with clear headings and bullet points.`;

            const chatHistory = [{ role: "user", parts: [{ text: prompt }] }];
            const payload = { contents: chatHistory };
            const apiKey = "";
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;

            const response = await retryWithExponentialBackoff(async () => {
                const res = await fetch(apiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                if (!res.ok) throw new Error(`API error: ${res.status}`);
                return res.json();
            });

            if (response.candidates && response.candidates.length > 0) {
                const text = response.candidates[0].content.parts[0].text;
                setSuggestions(text);
            } else {
                throw new Error("Failed to get suggestions from the API.");
            }

        } catch (err) {
            console.error(err);
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="p-6 flex flex-col h-[500px] relative">
            <div className="flex items-center justify-between border-b border-purple-700/50 pb-4 mb-4">
                <button onClick={onGoBack} className="text-gray-400 hover:text-purple-400 transition-colors">
                    <ChevronLeft size={24} />
                </button>
                <h2 className="text-xl font-semibold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-500 flex items-center space-x-2">
                    <Cloudy size={24} className="text-cyan-400" />
                    <span>Weather-Based Food Ideas</span>
                </h2>
                <div className="w-6"></div>
            </div>

            <div className="flex-grow overflow-y-auto custom-scrollbar mb-4 flex flex-col items-center justify-center text-center">
                {!suggestions && !isLoading && !error && (
                    <div className="flex flex-col items-center space-y-6 animate-fade-in">
                        <Cloudy className="w-16 h-16 text-purple-400 animate-pulse" />
                        <p className="text-gray-300 max-w-sm">
                            Get food ideas tailored to the weather. Enter your city and click a weather type below.
                        </p>
                        <div className="w-full max-w-xs flex flex-col space-y-4">
                            <input
                                type="text"
                                value={location}
                                onChange={(e) => setLocation(e.target.value)}
                                placeholder="Enter your city..."
                                className="w-full p-3 rounded-full bg-gray-700 text-white border border-purple-600/50 focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all duration-300"
                            />
                             <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <button onClick={() => getSuggestions(location, "Hot Day")} className="flex items-center justify-center space-x-2 bg-yellow-500/80 text-white px-4 py-2 rounded-full hover:bg-yellow-600 transition-colors shadow-md">
                                    <Sun size={20}/> <span>Hot Day</span>
                                </button>
                                <button onClick={() => getSuggestions(location, "Rainy Day")} className="flex items-center justify-center space-x-2 bg-blue-500/80 text-white px-4 py-2 rounded-full hover:bg-blue-600 transition-colors shadow-md">
                                    <CloudRain size={20}/> <span>Rainy Day</span>
                                </button>
                                <button onClick={() => getSuggestions(location, "Cold Day")} className="flex items-center justify-center space-x-2 bg-cyan-500/80 text-white px-4 py-2 rounded-full hover:bg-cyan-600 transition-colors shadow-md">
                                    <Snowflake size={20}/> <span>Cold Day</span>
                                </button>
                            </div>
                        </div>
                    </div>
                )}
                {isLoading && (
                    <div className="flex flex-col items-center space-y-4">
                        <div className="animate-spin h-10 w-10 text-purple-400">
                            <Sparkles size={40} />
                        </div>
                        <p className="text-gray-300">Checking the weather and brewing up ideas...</p>
                    </div>
                )}
                {error && (
                    <div className="p-4 bg-red-800 bg-opacity-50 text-red-200 rounded-xl shadow-lg border border-red-700">
                        <p className="font-bold">Error:</p>
                        <p>{error}</p>
                    </div>
                )}
                {suggestions && weather && (
                    <div className="w-full text-left animate-fade-in p-4 bg-gray-700 bg-opacity-50 rounded-xl shadow-lg border border-purple-600/50">
                        <div className="text-center mb-4 p-3 bg-gray-800/50 rounded-lg">
                            <h3 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">
                                Ideas for a {weather.condition} Day in {location} {weather.icon}
                            </h3>
                        </div>
                        <div className="prose prose-invert max-w-none bot-prose"> {/* Added bot-prose here */}
                            {renderBotMessage(suggestions)}
                        </div>
                    </div>
                )}
            </div>
             {suggestions && (
                <div className="mt-4 flex justify-center">
                    <button
                        onClick={() => { setSuggestions(null); setWeather(null); setLocation(''); }}
                        className="bg-gray-600 text-white p-3 rounded-full shadow-lg hover:bg-gray-700 transition-all duration-300 transform hover:scale-105 active:scale-95"
                    >
                        Check another location
                    </button>
                </div>
            )}
        </div>
    );
};

const CulturalFoodExplorer = ({ onGoBack }) => {
    const [dish, setDish] = useState('');
    const [result, setResult] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    
    const exampleDishes = ["Japanese Bento", "Tom Yum Soup", "Italian Pasta Carbonara", "Mexican Tacos"];

    const handleExplore = async (dishToExplore = dish) => {
        if (!dishToExplore) {
            setError("Please enter a dish name.");
            return;
        }
        setDish(dishToExplore);
        setIsLoading(true);
        setError(null);
        setResult(null);

        try {
            const prompt = `The user is interested in the dish "${dishToExplore}". 
1.  **Cultural Background**: Briefly explain the cultural background and origin of this dish.
2.  **Healthy Indian Adaptation**: Suggest a similar, healthy version of this dish using locally available Indian ingredients. If the dish is already healthy, mention that. If it's for a specific condition like diabetes, adapt it accordingly.
3.  **Recipe**: Provide a simple recipe for the Indian version.
4.  **Nutrient Info**: Give an approximate nutritional breakdown (calories, protein, carbs, fat) for the Indian version.
5.  **Language Translation**: Translate the ingredient names and cooking steps into Hindi (in latin script, e.g., 'Namak' for salt).

Format the response with clear headings and bullet points.`;

            const chatHistory = [{ role: "user", parts: [{ text: prompt }] }];
            const payload = { contents: chatHistory };
             const apiKey = "";
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;

            const response = await retryWithExponentialBackoff(async () => {
                const res = await fetch(apiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                if (!res.ok) throw new Error(`API error: ${res.status}`);
                return res.json();
            });

            if (response.candidates && response.candidates.length > 0) {
                const text = response.candidates[0].content.parts[0].text;
                setResult(text);
            } else {
                throw new Error("Failed to get a response from the API.");
            }

        } catch (err) {
            console.error(err);
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="p-6 flex flex-col h-[500px] relative">
            <div className="flex-shrink-0 flex items-center justify-between border-b border-purple-700/50 pb-4 mb-4">
                <button onClick={onGoBack} className="text-gray-400 hover:text-purple-400 transition-colors">
                    <ChevronLeft size={24} />
                </button>
                <h2 className="text-xl font-semibold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-500 flex items-center space-x-2">
                    <Globe size={24} className="text-cyan-400" />
                    <span>Cultural Food Explorer</span>
                </h2>
                <div className="w-6"></div>
            </div>

            <div className="flex-grow overflow-y-auto custom-scrollbar">
                {!result && !isLoading && !error && (
                    <div className="flex flex-col items-center justify-center text-center h-full animate-fade-in">
                        <Globe className="w-16 h-16 text-purple-400 animate-pulse mb-4" />
                        <p className="text-gray-300 max-w-sm mb-6">
                            Enter any international dish to learn about it and get a healthy Indian version.
                        </p>
                        <div className="w-full max-w-sm flex flex-col space-y-4">
                            <div className="flex items-center space-x-2">
                                <input
                                    type="text"
                                    value={dish}
                                    onChange={(e) => setDish(e.target.value)}
                                    placeholder="Enter a dish name..."
                                    className="flex-grow p-3 rounded-full bg-gray-700 text-white border border-purple-600/50 focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all duration-300"
                                />
                                <button
                                    onClick={() => handleExplore()}
                                    className="bg-gradient-to-r from-purple-600 to-pink-500 text-white p-3 rounded-full shadow-lg hover:from-purple-700 hover:to-pink-600 transition-all duration-300 transform hover:scale-105 active:scale-95"
                                >
                                    <Search size={20}/>
                                </button>
                            </div>
                            <div className="text-gray-400 text-sm">Or try one of these:</div>
                            <div className="grid grid-cols-2 gap-3">
                                {exampleDishes.map(ex => (
                                    <button key={ex} onClick={() => handleExplore(ex)} className="bg-gray-700/80 text-gray-200 px-4 py-2 rounded-lg hover:bg-gray-600 transition-colors shadow-md flex items-center justify-center space-x-2">
                                        <Globe size={16} />
                                        <span>{ex}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
                {isLoading && (
                    <div className="flex flex-col items-center justify-center h-full space-y-4">
                        <div className="animate-spin h-10 w-10 text-purple-400">
                            <Sparkles size={40} />
                        </div>
                        <p className="text-gray-300">Exploring culinary worlds...</p>
                    </div>
                )}
                {error && (
                    <div className="p-4 bg-red-800 bg-opacity-50 text-red-200 rounded-xl shadow-lg border border-red-700">
                        <p className="font-bold">Error:</p>
                        <p>{error}</p>
                    </div>
                )}
                {result && (
                    <div className="animate-fade-in">
                        <div className="w-full text-left p-4 bg-gray-700 bg-opacity-50 rounded-xl shadow-lg border border-purple-600/50">
                            <div className="prose prose-invert max-w-none bot-prose"> {/* Added bot-prose here */}
                                {renderBotMessage(result)}
                            </div>
                        </div>
                        <div className="mt-4 flex justify-center">
                            <button
                                onClick={() => { setResult(null); setDish(''); }}
                                className="bg-gray-600 text-white p-3 rounded-full shadow-lg hover:bg-gray-700 transition-all duration-300 transform hover:scale-105 active:scale-95"
                            >
                                Explore another dish
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

const SymptomRecommender = ({ onGoBack }) => {
    const [symptom, setSymptom] = useState('');
    const [result, setResult] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);

    const exampleSymptoms = [
        { label: "Headache", icon: <BrainCircuit size={20} /> },
        { label: "Feeling Bloated", icon: <Wind size={20} /> },
        { label: "Low Energy", icon: <Zap size={20} className="text-yellow-400" /> },
        { label: "Constipation", icon: <HelpCircle size={20} /> }
    ];

    const handleRecommendation = async (symptomToRecommend = symptom) => {
        if (!symptomToRecommend) {
            setError("Please enter a symptom or mood.");
            return;
        }
        setSymptom(symptomToRecommend);
        setIsLoading(true);
        setError(null);
        setResult(null);

        try {
            const prompt = `The user is experiencing: "${symptomToRecommend}". 
Please act as a nutritional expert. Suggest specific foods and drinks that could help alleviate this symptom or improve their mood. Explain why each food is beneficial. For example, for "constipation," you might suggest fiber-rich foods and explain how fiber helps. For "feeling bloated," you might suggest foods with high water content. Provide the information in a clear, easy-to-read format using headings and bullet points.`;

            const chatHistory = [{ role: "user", parts: [{ text: prompt }] }];
            const payload = { contents: chatHistory };
        const apiKey = "";
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;

            const response = await retryWithExponentialBackoff(async () => {
                const res = await fetch(apiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                if (!res.ok) throw new Error(`API error: ${res.status}`);
                return res.json();
            });

            if (response.candidates && response.candidates.length > 0) {
                const text = response.candidates[0].content.parts[0].text;
                setResult(text);
            } else {
                throw new Error("Failed to get a response from the API.");
            }

        } catch (err) {
            console.error(err);
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="p-6 flex flex-col h-[500px] relative">
            <div className="flex-shrink-0 flex items-center justify-between border-b border-purple-700/50 pb-4 mb-4">
                <button onClick={onGoBack} className="text-gray-400 hover:text-purple-400 transition-colors">
                    <ChevronLeft size={24} />
                </button>
                <h2 className="text-xl font-semibold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-500 flex items-center space-x-2">
                    <HeartPulse size={24} className="text-red-400" />
                    <span>Symptom Food Recommender</span>
                </h2>
                <div className="w-6"></div>
            </div>

            <div className="flex-grow overflow-y-auto custom-scrollbar">
                {!result && !isLoading && !error && (
                    <div className="flex flex-col items-center justify-center text-center h-full animate-fade-in">
                        <HeartPulse className="w-16 h-16 text-purple-400 animate-pulse mb-4" />
                        <p className="text-gray-300 max-w-sm mb-6">
                            Enter a symptom or mood to get food recommendations that might help.
                        </p>
                        <div className="w-full max-w-md flex flex-col space-y-4">
                            <div className="flex items-center space-x-2">
                                <input
                                    type="text"
                                    value={symptom}
                                    onChange={(e) => setSymptom(e.target.value)}
                                    placeholder="e.g., 'Headache' or 'Feeling tired'"
                                    className="flex-grow p-3 rounded-full bg-gray-700 text-white border border-purple-600/50 focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all duration-300"
                                />
                                <button
                                    onClick={() => handleRecommendation()}
                                    className="bg-gradient-to-r from-purple-600 to-pink-500 text-white p-3 rounded-full shadow-lg hover:from-purple-700 hover:to-pink-600 transition-all duration-300 transform hover:scale-105 active:scale-95"
                                >
                                    <Search size={20}/>
                                </button>
                            </div>
                             <div className="text-gray-400 text-sm">Or try one of these common concerns:</div>
                            <div className="grid grid-cols-2 gap-3">
                                {exampleSymptoms.map(ex => (
                                    <button key={ex.label} onClick={() => handleRecommendation(ex.label)} className="bg-gray-700/80 text-gray-200 px-4 py-2 rounded-lg hover:bg-gray-600 transition-colors shadow-md flex items-center justify-center space-x-2">
                                        {ex.icon}
                                        <span>{ex.label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
                {isLoading && (
                     <div className="flex flex-col items-center justify-center h-full space-y-4">
                        <div className="animate-spin h-10 w-10 text-purple-400">
                            <Sparkles size={40} />
                        </div>
                        <p className="text-gray-300">Finding food-based solutions...</p>
                    </div>
                )}
                {error && (
                    <div className="p-4 bg-red-800 bg-opacity-50 text-red-200 rounded-xl shadow-lg border border-red-700">
                        <p className="font-bold">Error:</p>
                        <p>{error}</p>
                    </div>
                )}
                {result && (
                    <div className="animate-fade-in">
                        <div className="w-full text-left p-4 bg-gray-700 bg-opacity-50 rounded-xl shadow-lg border border-purple-600/50">
                            <div className="prose prose-invert max-w-none bot-prose"> {/* Added bot-prose here */}
                                {renderBotMessage(result)}
                            </div>
                        </div>
                        <div className="mt-4 flex justify-center">
                            <button
                                onClick={() => { setResult(null); setSymptom(''); }}
                                className="bg-gray-600 text-white p-3 rounded-full shadow-lg hover:bg-gray-700 transition-all duration-300 transform hover:scale-105 active:scale-95"
                            >
                                Check another symptom
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

const MythBuster = ({ onGoBack }) => {
    const [myth, setMyth] = useState('');
    const [result, setResult] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);

    const exampleMyths = ["Is rice bad for weight loss?", "Is ghee unhealthy?", "Does drinking coffee stunt growth?", "Are artificial sweeteners safe?"];

    const handleBustMyth = async (mythToBust = myth) => {
        if (!mythToBust) {
            setError("Please enter a myth or a question.");
            return;
        }
        setMyth(mythToBust);
        setIsLoading(true);
        setError(null);
        setResult(null);

        try {
            const prompt = `The user has a question about a nutrition myth: "${mythToBust}".
Act as a science communicator and nutrition expert. Provide a clear, concise, and science-backed explanation that either debunks or validates the user's question. Use simple language and cite general scientific consensus or well-known studies if applicable (without needing specific links). For example, if asked "Is ghee unhealthy?", explain its composition (saturated fats, vitamins) and the role of moderation. The goal is to provide a trustworthy, easy-to-understand answer. Format the response clearly.`;

            const chatHistory = [{ role: "user", parts: [{ text: prompt }] }];
            const payload = { contents: chatHistory };
             const apiKey = "";
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;

            const response = await retryWithExponentialBackoff(async () => {
                const res = await fetch(apiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                if (!res.ok) throw new Error(`API error: ${res.status}`);
                return res.json();
            });

            if (response.candidates && response.candidates.length > 0) {
                const text = response.candidates[0].content.parts[0].text;
                setResult(text);
            } else {
                throw new Error("Failed to get a response from the API.");
            }

        } catch (err) {
            console.error(err);
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="p-6 flex flex-col h-[500px] relative">
            <div className="flex-shrink-0 flex items-center justify-between border-b border-purple-700/50 pb-4 mb-4">
                <button onClick={onGoBack} className="text-gray-400 hover:text-purple-400 transition-colors">
                    <ChevronLeft size={24} />
                </button>
                <h2 className="text-xl font-semibold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-500 flex items-center space-x-2">
                    <BookOpen size={24} className="text-yellow-400" />
                    <span>Nutrition Myth Buster</span>
                </h2>
                <div className="w-6"></div>
            </div>

            <div className="flex-grow overflow-y-auto custom-scrollbar">
                {!result && !isLoading && !error && (
                    <div className="flex flex-col items-center justify-center text-center h-full animate-fade-in">
                        <BookOpen className="w-16 h-16 text-purple-400 animate-pulse mb-4" />
                        <p className="text-gray-300 max-w-sm mb-6">
                            Heard something about nutrition you're not sure about? Let's separate fact from fiction.
                        </p>
                        <div className="w-full max-w-md flex flex-col space-y-4">
                            <div className="flex items-center space-x-2">
                                <input
                                    type="text"
                                    value={myth}
                                    onChange={(e) => setMyth(e.target.value)}
                                    placeholder="e.g., 'Is rice bad for weight loss?'"
                                    className="flex-grow p-3 rounded-full bg-gray-700 text-white border border-purple-600/50 focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all duration-300"
                                />
                                <button
                                    onClick={() => handleBustMyth()}
                                    className="bg-gradient-to-r from-purple-600 to-pink-500 text-white p-3 rounded-full shadow-lg hover:from-purple-700 hover:to-pink-600 transition-all duration-300 transform hover:scale-105 active:scale-95"
                                >
                                    <Search size={20} />
                                </button>
                            </div>
                             <div className="text-gray-400 text-sm">Or investigate one of these:</div>
                            <div className="space-y-3 w-full">
                                {exampleMyths.map(ex => (
                                    <button key={ex} onClick={() => handleBustMyth(ex)} className="w-full text-left bg-gray-700/80 text-gray-200 p-3 rounded-lg hover:bg-gray-600 transition-colors shadow-md flex items-center space-x-3">
                                        <HelpCircle className="text-purple-400 flex-shrink-0" size={20}/>
                                        <span>{ex}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
                {isLoading && (
                    <div className="flex flex-col items-center justify-center h-full space-y-4">
                        <div className="animate-spin h-10 w-10 text-purple-400">
                            <Sparkles size={40} />
                        </div>
                        <p className="text-gray-300">Consulting the science...</p>
                    </div>
                )}
                {error && (
                    <div className="p-4 bg-red-800 bg-opacity-50 text-red-200 rounded-xl shadow-lg border border-red-700">
                        <p className="font-bold">Error:</p>
                        <p>{error}</p>
                    </div>
                )}
                {result && (
                    <div className="animate-fade-in">
                        <div className="w-full text-left p-4 bg-gray-700 bg-opacity-50 rounded-xl shadow-lg border border-purple-600/50">
                            <div className="prose prose-invert max-w-none bot-prose"> {/* Added bot-prose here */}
                                {renderBotMessage(result)}
                            </div>
                        </div>
                        <div className="mt-4 flex justify-center">
                            <button
                                onClick={() => { setResult(null); setMyth(''); }}
                                className="bg-gray-600 text-white p-3 rounded-full shadow-lg hover:bg-gray-700 transition-all duration-300 transform hover:scale-105 active:scale-95"
                            >
                                Ask another question
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

// NEW Smart Grocery List & Meal Prep Component
const SmartGroceryList = ({ onGoBack }) => {
    const [planRequest, setPlanRequest] = useState('');
    const [generatedPlan, setGeneratedPlan] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);

    const exampleRequests = [
        "A 3-day low-carb meal plan for one person.",
        "A vegetarian meal plan for a family of 4 for a week.",
        "A high-protein meal plan for muscle gain.",
        "A simple 2-day meal plan for weight loss."
    ];

    const generateMealPlan = async () => {
        if (!planRequest.trim()) {
            setError("Please describe your meal plan request.");
            return;
        }
        setIsLoading(true);
        setError(null);
        setGeneratedPlan(null);

        try {
            const prompt = `Generate a detailed meal plan and a categorized grocery list based on the following request: "${planRequest}".
            
            The meal plan should include:
            - Day (e.g., Day 1)
            - Meal Type (e.g., Breakfast, Lunch, Dinner, Snack)
            - Dish Name
            - Ingredients for each dish
            - Simple instructions for each dish

            The grocery list should be categorized (e.g., Produce, Dairy, Grains, Proteins, Pantry Staples).
            
            Provide the response in a JSON object with two main keys: "mealPlan" (an array of daily meal objects) and "groceryList" (an array of categorized grocery items).
            
            Example JSON Structure:
            {
              "mealPlan": [
                {
                  "day": "Day 1",
                  "meals": [
                    {
                      "mealType": "Breakfast",
                      "dishName": "Oatmeal with Berries",
                      "ingredients": ["1/2 cup rolled oats", "1 cup water", "1/2 cup mixed berries", "1 tbsp honey"],
                      "instructions": "Combine oats and water, cook until creamy. Stir in berries and honey."
                    }
                  ]
                }
              ],
              "groceryList": [
                {
                  "category": "Produce",
                  "items": ["Mixed berries", "Spinach"]
                },
                {
                  "category": "Grains",
                  "items": ["Rolled oats"]
                }
              ]
            }`;

            const chatHistory = [{ role: "user", parts: [{ text: prompt }] }];
            
            const responseSchema = {
                type: "OBJECT",
                properties: {
                    "mealPlan": {
                        type: "ARRAY",
                        items: {
                            type: "OBJECT",
                            properties: {
                                "day": { "type": "STRING" },
                                "meals": {
                                    type: "ARRAY",
                                    items: {
                                        type: "OBJECT",
                                        properties: {
                                            "mealType": { "type": "STRING" },
                                            "dishName": { "type": "STRING" },
                                            "ingredients": {
                                                type: "ARRAY",
                                                items: { "type": "STRING" }
                                            },
                                            "instructions": { "type": "STRING" }
                                        },
                                        required: ["mealType", "dishName", "ingredients", "instructions"]
                                    }
                                }
                            },
                            required: ["day", "meals"]
                        }
                    },
                    "groceryList": {
                        type: "ARRAY",
                        items: {
                            type: "OBJECT",
                            properties: {
                                "category": { "type": "STRING" },
                                "items": {
                                    type: "ARRAY",
                                    items: { "type": "STRING" }
                                }
                            },
                            required: ["category", "items"]
                        }
                    }
                },
                required: ["mealPlan", "groceryList"]
            };

            const payload = {
                contents: chatHistory,
                generationConfig: {
                    responseMimeType: "application/json",
                    responseSchema: responseSchema
                }
            };

             const apiKey = "";
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;

            const response = await retryWithExponentialBackoff(async () => {
                const res = await fetch(apiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                if (!res.ok) throw new Error(`API error: ${res.status}`);
                return res.json();
            });

            if (response.candidates && response.candidates.length > 0) {
                const jsonText = response.candidates[0].content.parts[0].text;
                const parsedJson = JSON.parse(jsonText);
                setGeneratedPlan(parsedJson);
            } else {
                throw new Error("Failed to get a valid response from the API.");
            }

        } catch (err) {
            console.error("Error generating meal plan:", err);
            setError(err.message || "Failed to generate meal plan. Please try again.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="p-6 flex flex-col h-[500px] relative">
            <div className="flex-shrink-0 flex items-center justify-between border-b border-purple-700/50 pb-4 mb-4">
                <button onClick={onGoBack} className="text-gray-400 hover:text-purple-400 transition-colors">
                    <ChevronLeft size={24} />
                </button>
                <h2 className="text-xl font-semibold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-500 flex items-center space-x-2">
                    <ShoppingCart size={24} className="text-green-400" />
                    <span>Smart Grocery List & Meal Prep</span>
                </h2>
                <div className="w-6"></div>
            </div>

            <div className="flex-grow overflow-y-auto custom-scrollbar">
                {!generatedPlan && !isLoading && !error && (
                    <div className="flex flex-col items-center justify-center text-center h-full animate-fade-in">
                        <ShoppingCart className="w-16 h-16 text-purple-400 animate-pulse mb-4" />
                        <p className="text-gray-300 max-w-sm mb-6">
                            Describe your desired meal plan (e.g., "a 3-day low-carb plan") and get a full meal plan with a grocery list!
                        </p>
                        <div className="w-full max-w-md flex flex-col space-y-4">
                            <div className="flex items-center space-x-2">
                                <input
                                    type="text"
                                    value={planRequest}
                                    onChange={(e) => setPlanRequest(e.target.value)}
                                    placeholder="e.g., '5-day high-protein plan for weight loss'"
                                    className="flex-grow p-3 rounded-full bg-gray-700 text-white border border-purple-600/50 focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all duration-300"
                                />
                                <button
                                    onClick={generateMealPlan}
                                    className="bg-gradient-to-r from-purple-600 to-pink-500 text-white p-3 rounded-full shadow-lg hover:from-purple-700 hover:to-pink-600 transition-all duration-300 transform hover:scale-105 active:scale-95"
                                >
                                    <Sparkles size={20} />
                                </button>
                            </div>
                            <div className="text-gray-400 text-sm">Or try one of these examples:</div>
                            <div className="space-y-3 w-full">
                                {exampleRequests.map(req => (
                                    <button key={req} onClick={() => setPlanRequest(req)} className="w-full text-left bg-gray-700/80 text-gray-200 p-3 rounded-lg hover:bg-gray-600 transition-colors shadow-md flex items-center space-x-3">
                                        <ClipboardList className="text-green-400 flex-shrink-0" size={20}/>
                                        <span>{req}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
                {isLoading && (
                    <div className="flex flex-col items-center justify-center h-full space-y-4">
                        <div className="animate-spin h-10 w-10 text-purple-400">
                            <Sparkles size={40} />
                        </div>
                        <p className="text-gray-300">Generating your personalized meal plan and grocery list...</p>
                    </div>
                )}
                {error && (
                    <div className="p-4 bg-red-800 bg-opacity-50 text-red-200 rounded-xl shadow-lg border border-red-700">
                        <p className="font-bold">Error:</p>
                        <p>{error}</p>
                    </div>
                )}
                {generatedPlan && (
                    <div className="animate-fade-in space-y-8">
                        <div>
                            <h3 className="text-2xl font-bold text-center text-transparent bg-clip-text bg-gradient-to-r from-teal-400 to-cyan-500 mb-4">
                                Your Meal Plan
                            </h3>
                            {generatedPlan.mealPlan.map((dayPlan, dayIndex) => (
                                <div key={dayIndex} className="mb-6 p-4 bg-gray-700 bg-opacity-50 rounded-xl shadow-lg border border-purple-600/50">
                                    <h4 className="text-xl font-semibold text-purple-300 mb-3">{dayPlan.day}</h4>
                                    <div className="space-y-4">
                                        {dayPlan.meals.map((meal, mealIndex) => (
                                            <div key={mealIndex} className="bg-gray-800 p-4 rounded-lg shadow-inner border border-gray-600">
                                                <p className="font-bold text-lg text-white mb-1">{meal.mealType}: {meal.dishName}</p>
                                                <p className="text-gray-300 text-sm">
                                                    <span className="font-semibold text-pink-300">Ingredients:</span> {meal.ingredients.join(', ')}
                                                </p>
                                                <p className="text-gray-300 text-sm mt-2">
                                                    <span className="font-semibold text-teal-300">Instructions:</span> {meal.instructions}
                                                </p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div>
                            <h3 className="text-2xl font-bold text-center text-transparent bg-clip-text bg-gradient-to-r from-teal-400 to-cyan-500 mb-4">
                                Your Grocery List
                            </h3>
                            <div className="space-y-4">
                                {generatedPlan.groceryList.map((category, catIndex) => (
                                    <div key={catIndex} className="p-4 bg-gray-700 bg-opacity-50 rounded-xl shadow-lg border border-purple-600/50">
                                        <h4 className="text-xl font-semibold text-purple-300 mb-3">{category.category}</h4>
                                        <ul className="list-disc list-inside space-y-1 text-gray-200">
                                            {category.items.map((item, itemIndex) => (
                                                <li key={itemIndex}>{item}</li>
                                            ))}
                                        </ul>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="mt-8 flex justify-center">
                            <button
                                onClick={() => { setGeneratedPlan(null); setPlanRequest(''); }}
                                className="bg-gray-600 text-white p-3 rounded-full shadow-lg hover:bg-gray-700 transition-all duration-300 transform hover:scale-105 active:scale-95"
                            >
                                Generate Another Plan
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};


const ChatPage = ({ messages, input, setInput, isLoading, isListening, handleSendMessage, toggleSpeechRecognition, handleTextToSpeech, isPlaying, messagesEndRef, suggestions, handleKeyPress, fact, handleImageUpload, imagePreview, clearImageUpload, onFeatureSelect, activeFeature }) => {
    // Determine which content to show based on the active feature
    const renderChatContent = () => {
        if (activeFeature === 'food-guide') {
            return <CityFoodSuggestionsComponent onGoBack={() => onFeatureSelect('chat')} />;
        }
        if (activeFeature === 'food-lookup') {
            return <FoodLookupPage onGoBack={() => onFeatureSelect('chat')} />;
        }
        if (activeFeature === 'weather-food') {
            return <WeatherFoodSuggestions onGoBack={() => onFeatureSelect('chat')} />;
        }
        if (activeFeature === 'cultural-explorer') {
            return <CulturalFoodExplorer onGoBack={() => onFeatureSelect('chat')} />;
        }
        if (activeFeature === 'symptom-recommender') {
            return <SymptomRecommender onGoBack={() => onFeatureSelect('chat')} />;
        }
        if (activeFeature === 'myth-buster') {
            return <MythBuster onGoBack={() => onFeatureSelect('chat')} />;
        }
        if (activeFeature === 'grocery-list') {
            return <SmartGroceryList onGoBack={() => onFeatureSelect('chat')} />;
        }
        
        // This is the default chat content
        return (
            <>
                <div className="p-6 h-96 overflow-y-auto custom-scrollbar">
                    {messages.length === 0 && !isLoading && (
                        <div className="text-center text-gray-400 mt-20 animate-fade-in">
                            <p className="text-lg mb-2">Welcome to NutriBot AI!</p>
                            <p className="text-sm">Ask me anything about nutrition, healthy eating, or dietary advice.</p>
                            <p className="text-xs mt-4">Or try one of the suggestions below!</p>
                        </div>
                    )}
                    {messages.map((msg, index) => (
                        <div
                            key={index}
                            className={`flex mb-4 animate-fade-in ${msg.sender === 'user' ? 'justify-end' : 'justify-start items-start'}`}
                        >
                            {msg.sender === 'bot' && (
                                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center mr-2 shadow-md">
                                    <Bot className="w-5 h-5 text-white" />
                                </div>
                            )}
                            <div
                                className={`max-w-[85%] p-4 rounded-2xl shadow-lg relative ${
                                    msg.sender === 'user'
                                        ? 'bg-purple-700 bg-opacity-80 text-white rounded-br-none'
                                        : 'bg-indigo-900 bg-opacity-70 text-white rounded-bl-none border border-blue-700'
                                }`}
                            >
                                {/* Display uploaded image if it exists in the message */}
                                {msg.image && (
                                    <div className="mb-4">
                                        <img
                                            src={msg.image}
                                            alt="Uploaded ingredients"
                                            className="max-w-full h-auto rounded-lg shadow-md"
                                        />
                                    </div>
                                )}
                                {msg.sender === 'bot' ? (
                                    <>
                                        <div className="prose prose-invert max-w-none bot-prose"> {/* Added bot-prose here */}
                                            {renderBotMessage(msg.text)}
                                        </div>
                                        <button
                                            onClick={() => handleTextToSpeech(msg.text, index)}
                                            className="absolute bottom-1 right-2 p-1 rounded-full text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500"
                                            title={isPlaying === index ? "Pause" : "Play"}
                                        >
                                            {isPlaying === index ? (
                                                <Pause className="w-4 h-4" />
                                            ) : (
                                                <Play className="w-4 h-4" />
                                            )}
                                        </button>
                                    </>
                                ) : (
                                    <p className="text-base leading-relaxed text-gray-200">{msg.text}</p>
                                )}
                            </div>
                        </div>
                    ))}
                    {isLoading && (
                        <>
                            <AnalyzingLoader isImage={!!imagePreview}/>
                            <NutrientFacts fact={fact} />
                        </>
                    )}
                    <div ref={messagesEndRef} />
                </div>
        
                <div className="px-6 py-4 border-t border-purple-700/50">
                    <h3 className="text-lg font-semibold text-purple-300 mb-2">Quick Questions</h3>
                    <div className="grid grid-rows-3 grid-flow-col gap-4 overflow-x-auto flex overflow-x-auto space-x-4 pb-2 custom-scrollbar-horizontal">
                        {suggestions.map((suggestion, index) => (
                            <button
                                key={index}
                                onClick={() => handleSendMessage(suggestion)}
                                className="flex-shrink-0 bg-gray-700 bg-opacity-70 border border-purple-600/50 text-gray-300 text-sm px-4 py-2 rounded-full shadow-lg hover:bg-gray-600 transition-all duration-300 transform hover:scale-105 active:scale-95 whitespace-nowrap"
                            >
                                {suggestion}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="p-6 border-t border-purple-700/50">
                    {/* Image Preview */}
                    {imagePreview && (
                        <div className="relative mb-4">
                            <img src={imagePreview} alt="Preview" className="h-24 w-24 object-cover rounded-xl border border-purple-600/50 shadow-lg" />
                            <button
                                onClick={clearImageUpload}
                                className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full shadow-md"
                                title="Remove image"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    )}
                    <div className="flex items-center space-x-4">
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyPress={handleKeyPress}
                            placeholder="Ask about nutrients..."
                            className="flex-grow p-3 rounded-full bg-gray-700 bg-opacity-80 border border-purple-600/50 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-300 shadow-inner"
                            disabled={isLoading || isListening}
                        />
                        
                        {/* Hidden file input */}
                        <input
                            type="file"
                            id="image-upload"
                            accept="image/*"
                            onChange={handleImageUpload}
                            className="hidden"
                        />
                        {/* Button to trigger file input */}
                        <label htmlFor="image-upload" className={`p-3 rounded-full shadow-lg transition-all duration-300 transform hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ${isLoading ? 'bg-gray-500' : 'bg-gray-700'}`}>
                            <ImageIcon className="w-6 h-6 text-white" />
                        </label>

                        <button
                            onClick={toggleSpeechRecognition}
                            className={`p-3 rounded-full shadow-lg transition-all duration-300 transform hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${isListening ? 'bg-red-600' : 'bg-gray-700'}`}
                            disabled={isLoading}
                            title={isListening ? "Stop listening" : "Start voice input"}
                        >
                            <Mic className="w-6 h-6 text-white" />
                        </button>
                        <button
                            onClick={() => handleSendMessage()}
                            className="bg-gradient-to-r from-purple-600 to-pink-500 text-white p-3 rounded-full shadow-lg hover:from-purple-700 hover:to-pink-600 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:ring-offset-gray-900 transition-all duration-300 transform hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                            disabled={isLoading || (input.trim() === '' && !imagePreview) || isListening}
                        >
                            <Send className="w-6 h-6" />
                        </button>
                    </div>
                </div>
            </>
        );
    };

    return (
       <div className="flex flex-col h-full">
    {/* Scrollable Feature Buttons Bar */}
    <div className="flex overflow-x-auto space-x-3 px-4 py-2 border-b border-purple-700/50 bg-gray-800 bg-opacity-70 custom-scrollbar-horizontal">
        {[
            { id: 'chat', label: 'Chat', icon: <MessageSquare size={20} /> },
            { id: 'food-guide', label: 'Food Guide', icon: <Utensils size={20} /> },
            { id: 'food-lookup', label: 'Food Lookup', icon: <Database size={20} /> },
            { id: 'weather-food', label: 'Weather Food', icon: <Cloudy size={20} /> },
            { id: 'cultural-explorer', label: 'Explorer', icon: <Globe size={20} /> },
            { id: 'symptom-recommender', label: 'Symptom Helper', icon: <HeartPulse size={20} /> },
            { id: 'myth-buster', label: 'Myth Buster', icon: <BookOpen size={20} /> },
            { id: 'grocery-list', label: 'Grocery & Prep', icon: <ShoppingCart size={20} /> }, // New button
        ].map(({ id, label, icon }) => (
            <button
                key={id}
                onClick={() => onFeatureSelect(id)}
                className={`flex items-center space-x-2 px-3 py-2 rounded-full whitespace-nowrap transition-colors ${
                    activeFeature === id
                        ? 'bg-purple-700 text-white'
                        : 'text-gray-400 hover:bg-gray-700'
                }`}
            >
                {icon}
                <span className="text-sm hidden sm:inline">{label}</span>
            </button>
        ))}
    </div>

    {/* Main content */}
    {renderChatContent()}
</div>

    );
};


function NutriBotApp({ isAuthenticated, userId }) {
    const { db } = useContext(AppContext);
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isPlaying, setIsPlaying] = useState(null);
    const [isListening, setIsListening] = useState(false);
    const [userProfile, setUserProfile] = useState(null);
    const [showProfileModal, setShowProfileModal] = useState(false);
    const [authReady, setAuthReady] = useState(false);
    const [currentPage, setCurrentPage] = useState('home');
    const [fact, setFact] = useState(null);
    const [imageUpload, setImageUpload] = useState(null);
    const [imagePreview, setImagePreview] = useState(null);
    const [activeChatFeature, setActiveChatFeature] = useState('chat'); // New state for features within chat
    // Removed isAuthenticated and authView states

    const messagesEndRef = useRef(null);
    const audioRef = useRef(null);
    const speechRecognitionRef = useRef(null);

    const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
    
    // Set up Speech Recognition
    useEffect(() => {
        if (isSpeechRecognitionSupported) {
            speechRecognitionRef.current = new SpeechRecognition();
            speechRecognitionRef.current.continuous = false;
            speechRecognitionRef.current.interimResults = false;
            speechRecognitionRef.current.lang = 'en-US';

            speechRecognitionRef.current.onresult = (event) => {
                const transcript = event.results[0][0].transcript;
                setInput(transcript);
                handleSendMessage(transcript);
            };

            speechRecognitionRef.current.onend = () => {
                setIsListening(false);
            };

            speechRecognitionRef.current.onerror = (event) => {
                console.error('Speech recognition error:', event.error);
                setIsListening(false);
            };
        }
    }, []);

    // Scroll to the bottom of the chat when new messages arrive
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Handle audio events
    useEffect(() => {
        if (audioRef.current) {
            const audio = audioRef.current;
            audio.onended = () => setIsPlaying(null);
        }
    }, [isPlaying]);

    // Fetch user profile from Firestore
    useEffect(() => {
        if (!db || !userId || !isAuthenticated) return;
        const fetchProfile = async () => {
            const docRef = doc(db, `users/${userId}/profile/info`);
            try {
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    const profileData = docSnap.data();
                    setUserProfile(profileData);
                } else {
                    setUserProfile(null);
                }
            } catch (error) {
                console.error("Error fetching user profile:", error);
                setUserProfile(null);
            }
        };
        fetchProfile();
    }, [db, userId, isAuthenticated]);


    // Save user profile to Firestore
    const saveUserProfile = async (profile) => {
        if (!db || !userId || !isAuthenticated) {
            console.error("Firebase not initialized or user ID not available.");
            return;
        }

        const docRef = doc(db, `users/${userId}/profile/info`);
        try {
            await setDoc(docRef, profile, { merge: true });
            setUserProfile(profile);
            setShowProfileModal(false);
        } catch (error) {
            console.error("Error saving user profile:", error);
        }
    };


    // Function to handle image upload
    const handleImageUpload = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                const base64Data = reader.result.split(',')[1];
                setImageUpload(base64Data);
                setImagePreview(reader.result);
            };
            reader.readAsDataURL(file);
        }
    };

    // Function to clear image preview
    const clearImageUpload = () => {
        setImageUpload(null);
        setImagePreview(null);
        setInput('');
    };

    // Function to call the Gemini API for text generation
    const getBotResponse = async (chatHistory, imageData) => {
        // Transform the internal messages array to the API-compatible format.
        const apiChatHistory = chatHistory.map(msg => ({
            role: msg.sender === 'user' ? 'user' : 'model',
            parts: [{ text: msg.text }]
        }));

        // Add user profile as a system prompt at the beginning of the conversation.
        if (userProfile && userProfile.name) {
            const profilePrompt = `You are a nutrition expert. The user is named ${userProfile.name}, is ${userProfile.age} years old, has dietary restrictions of ${userProfile.restrictions}, and a health goal of ${userProfile.goal}. Respond to their queries based on this context.`;
            apiChatHistory.unshift({ role: "user", parts: [{ text: profilePrompt }] });
        } else {
             // If no profile, add a general system prompt
            apiChatHistory.unshift({ role: "user", parts: [{ text: "You are a helpful and friendly nutrition expert. Generate responses with rich formatting using markdown-like syntax for bold text (**text**), lists (* list item), and horizontal rules (---) for a better UI." }] });
        }

        let payload;
       if (imageData) {
    const imagePrompt = input?.trim();
    payload = {
        contents: [{
            role: "user",
            parts: [
                { text: imagePrompt },
                {
                    inlineData: {
                        mimeType: "image/png",
                        data: imageData
                    }
                }
            ]
        }],
    };
}

 else {
            payload = { contents: apiChatHistory };
        }

           const apiKey = "";
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;
        try {
            const response = await retryWithExponentialBackoff(async () => {
                const res = await fetch(apiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                if (!res.ok) {
                    const errorBody = await res.json();
                    throw new Error(`API error: ${res.status} ${res.statusText} - ${JSON.stringify(errorBody)}`);
                }
                return res.json();
            });

            if (response.candidates && response.candidates.length > 0 &&
                response.candidates[0].content && response.candidates[0].content.parts &&
                response.candidates[0].content.parts.length > 0) {
                return response.candidates[0].content.parts[0].text;
            } else {
                console.error("Unexpected API response structure:", response);
                return "I'm sorry, I couldn't get a clear response. Please try again.";
            }
        } catch (error) {
            console.error("Error fetching from Gemini API:", error);
            return "Oops! Something went wrong while trying to get a response. Please check your internet connection or try again later.";
        }
    };

    // Function to fetch a single structured fact
    const fetchNutrientFacts = async () => {
        // Updated prompt to focus on fruits
        const prompt = "Provide 1 interesting and concise fact about a specific fruit and its nutrients.";
        const chatHistory = [{ role: "user", parts: [{ text: prompt }] }];

        // Define the JSON schema for the single fact object
        const responseSchema = {
            type: "OBJECT",
            properties: {
                "fact": { "type": "STRING" }
            },
            "propertyOrdering": ["fact"]
        };

        const payload = {
            contents: chatHistory,
            generationConfig: {
                responseMimeType: "application/json",
                responseSchema: responseSchema
            }
        };

         const apiKey = "";
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;
        try {
            const response = await retryWithExponentialBackoff(async () => {
                const res = await fetch(apiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                if (!res.ok) {
                    throw new Error(`API error: ${res.status}`);
                }
                return res.json();
            });

            if (response.candidates && response.candidates.length > 0) {
                const jsonText = response.candidates[0].content.parts[0].text;
                const parsedJson = JSON.parse(jsonText);
                setFact(parsedJson);
            }
        } catch (error) {
            console.error("Error fetching nutrient fact:", error);
            setFact({ fact: "Did you know... Bananas contain potassium, which helps regulate fluid balance and muscle contractions." });
        }
    };

    // Function to call the Gemini API for text-to-speech
    const handleTextToSpeech = async (text, index) => {
        if (audioRef.current && isPlaying === index) {
            audioRef.current.pause();
            setIsPlaying(null);
            return;
        }

        setIsPlaying(index);
        console.log("Attempting TTS for text:", text);
        const payload = {
            contents: [{ parts: [{ text }] }],
            generationConfig: {
                responseModalities: ["AUDIO"],
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: { voiceName: "Rasalgethi" }
                    }
                }
            },
            model: "gemini-2.5-flash-preview-tts"
        };
           const apiKey = "";
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;

        try {
            const response = await retryWithExponentialBackoff(async () => {
                const res = await fetch(apiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                if (!res.ok) {
                    const errorBody = await res.json();
                    throw new Error(`TTS API error: ${res.status} ${res.statusText} - ${JSON.stringify(errorBody)}`);
                }
                return res.json();
            });

            console.log("TTS API raw response:", response);

            const part = response?.candidates?.[0]?.content?.parts?.[0];
            const audioData = part?.inlineData?.data;
            const mimeType = part?.inlineData?.mimeType;

            if (audioData && mimeType && mimeType.startsWith("audio/")) {
                console.log("Received audio data. MimeType:", mimeType, "Data length:", audioData.length);
                const sampleRateMatch = mimeType.match(/rate=(\d+)/);
                const sampleRate = sampleRateMatch ? parseInt(sampleRateMatch[1], 10) : 16000;
                console.log("Determined sample rate:", sampleRate);

                const pcmData = base64ToArrayBuffer(audioData);
                console.log("PCM data ArrayBuffer created. Byte length:", pcmData.byteLength);

                const wavBlob = pcmToWav(pcmData, sampleRate);
                console.log("WAV Blob created. Size:", wavBlob.size, "Type:", wavBlob.type);

                const audioUrl = URL.createObjectURL(wavBlob);
                console.log("Audio URL created:", audioUrl);

                if (audioRef.current) {
                    audioRef.current.src = audioUrl;
                    audioRef.current.play();
                    console.log("Audio playback initiated.");
                } else {
                    console.warn("audioRef.current is null, cannot play audio.");
                }
            } else {
                console.error("Invalid TTS audio response: missing audioData or mimeType not starting with 'audio/'", response);
                setIsPlaying(null);
            }
        } catch (error) {
            console.error("Error with TTS API or audio processing:", error);
            setIsPlaying(null);
        }
    };

    // Handle sending a message (from text input or voice)
    const handleSendMessage = async (message = input) => {
        if ((message.trim() === '' && !imageUpload) || !isAuthenticated) return;

        if (audioRef.current) {
            audioRef.current.pause();
            setIsPlaying(null);
        }

        const newUserMessage = { sender: 'user', text: message.trim(), image: imagePreview, timestamp: new Date().toISOString() };
        const updatedMessages = [...messages, newUserMessage];
        setMessages(updatedMessages);
        setInput('');
        clearImageUpload();
        
        // Check for out-of-context questions
        const offTopicPhrases = [
            'who are you', 'what is your name', 'how were you created',
            'which model do you use', 'who made you', 'what are you',
            'how do you work', 'tell me about yourself',
            'what are you trained on', 'which model are you trained on',
            'who is your creator'
        ];
        const lowerCaseMessage = message.trim().toLowerCase();
        const isOffTopic = offTopicPhrases.some(phrase => lowerCaseMessage.includes(phrase));

        if (isOffTopic) {
            const cannedResponse = "I am NutriBot AI, an assistant dedicated to helping you with your nutrition and health questions. My purpose is to provide you with helpful information on food, diet, and wellness. Let's focus on that!";
            const newBotMessage = { sender: 'bot', text: cannedResponse };
            setMessages((prevMessages) => [...prevMessages, newBotMessage]);
            return;
        }

        setIsLoading(true);
        fetchNutrientFacts();

        const botResponseText = await getBotResponse(updatedMessages, imageUpload);

        const newBotMessage = { sender: 'bot', text: botResponseText };
        setMessages((prevMessages) => [...prevMessages, newBotMessage]);
        setIsLoading(false);
        setFact(null);
    };

    // Start/Stop speech recognition
    const toggleSpeechRecognition = () => {
        if (!isSpeechRecognitionSupported) {
            console.error('Your browser does not support Speech Recognition. Please use Chrome or a modern browser.');
            return;
        }

        if (isListening) {
            speechRecognitionRef.current.stop();
        } else {
            speechRecognitionRef.current.start();
        }
        setIsListening(!isListening);
    };

    const handleKeyPress = (e) => {
        if (e.key === 'Enter' && !isLoading) {
            handleSendMessage();
        }
    };

    const allSuggestions = [
  "What are some healthy fats?",
  "What can I cook with these ingredients?",
  "Suggest lightweight nutritious foods for hiking.",
  "Can I carry this food item on a flight?",
  "Tell me about the benefits of hydration.",
  "Suggest a quick, protein-rich snack.",
  "How can I get more fiber?",
  "Are these ingredients healthy?",
  "Give me a simple recipe for a nutritious smoothie.",
  "How do I store these leftovers?",
  "What are some low-calorie snacks?",
  "What can I make with these fruits?",
  "How can I build muscle quickly?",
  "Is this meal balanced?",
  "What are the benefits of intermittent fasting?",
  "How ripe is this fruit?",
  "How do I improve my sleep quality?",
  "Are these veggies fresh?",
  "Suggest a 10-minute workout routine.",
  "What’s the best way to cut this vegetable?",
  "What are the best sources of vitamins?",
  "Identify the ingredients in this dish.",
  "How can I boost my metabolism?",
  "What’s the calorie count of this meal?",
  "How do I practice mindfulness?",
  "Can I freeze this food?",
  "What's a healthy alternative to soda?",
  "Suggest a recipe with these ingredients.",
  "How do I manage stress effectively?",
  "How do I portion this meal properly?"
];

    const RenderedLines = () => (
  <div>
    {suggestions.map((line, index) =>
      line.split("\n").map((part, i) => (
        <React.Fragment key={`${index}-${i}`}>
          {part}
          <br />
        </React.Fragment>
      ))
    )}
  </div>
);


    const renderPage = () => {
        if (!isAuthenticated) {
            return (
                <div className="flex flex-col items-center justify-center h-[500px] text-gray-400">
                     <div className="text-center p-6 rounded-xl bg-gray-700 border border-red-500">
                        <p className="text-lg text-red-400 mb-3">Not Logged In</p>
                        <p className="text-gray-300">Please log in or register to use the NutriBot AI assistant.</p>
                     </div>
                </div>
            )
        }
        
        switch (currentPage) {
            case 'home':
                return <HomePage onNavigate={setCurrentPage} />;
            case 'chat':
                return <ChatPage
                    messages={messages}
                    input={input}
                    setInput={setInput}
                    isLoading={isLoading}
                    isListening={isListening}
                    handleSendMessage={handleSendMessage}
                    toggleSpeechRecognition={toggleSpeechRecognition}
                    handleTextToSpeech={handleTextToSpeech}
                    isPlaying={isPlaying}
                    messagesEndRef={messagesEndRef}
                    suggestions={allSuggestions}
                    handleKeyPress={handleKeyPress}
                    fact={fact}
                    handleImageUpload={handleImageUpload}
                    imagePreview={imagePreview}
                    clearImageUpload={clearImageUpload}
                    onFeatureSelect={setActiveChatFeature}
                    activeFeature={activeChatFeature}
                />;
            case 'features':
                return <FeaturesPage onGoBack={() => setCurrentPage('home')} />;
            default:
                return <HomePage onNavigate={setCurrentPage} />;
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-indigo-900 flex items-center justify-center p-4 font-inter text-white">
            <div className="relative w-full max-w-4xl bg-gray-800 bg-opacity-70 backdrop-filter backdrop-blur-lg rounded-3xl shadow-2xl overflow-hidden border border-purple-700/50 flex flex-col">
                
                {showProfileModal && <ProfileModal onSubmit={saveUserProfile} onClose={() => setShowProfileModal(false)} userProfile={userProfile} />}
                
                <div className="absolute inset-0 rounded-3xl pointer-events-none border-4 border-transparent animate-pulse-slow"
                     style={{
                         backgroundImage: 'linear-gradient(to right, #8B5CF6, #EC4899, #10B981)',
                         WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                         WebkitMaskComposite: 'xor',
                         maskComposite: 'exclude'
                     }}></div>

                <div className="p-6 w-full flex flex-col">
                    <div className="border-b border-purple-700/50 pb-6 mb-4 flex items-center justify-between">
                        <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-500 tracking-wide">
                            NutriBot AI
                        </h1>
                        <div className="flex items-center space-x-4">
                            {authReady && userId && ( // Display userId if available (from anonymous auth)
                                <span className="hidden md:inline text-purple-300 text-xs px-2 py-1 bg-gray-700 rounded-full">
                                    ID: {userId}
                                </span>
                            )}
                            <button
                                onClick={() => setCurrentPage('home')}
                                className="text-white p-2 rounded-full bg-gray-700 hover:bg-gray-600 transition-colors"
                                title="Home"
                            >
                                <Home className="w-5 h-5 text-gray-300" />
                            </button>
                            <button
                                onClick={() => setCurrentPage('features')}
                                className="text-white p-2 rounded-full bg-gray-700 hover:bg-gray-600 transition-colors"
                                title="View Features"
                            >
                                <Zap className="w-5 h-5 text-yellow-300" />
                            </button>
                            {isAuthenticated && (
                            <button
                                onClick={() => setShowProfileModal(true)}
                                className="group flex items-center text-purple-300 text-sm p-2 px-3 rounded-full bg-gray-700 hover:bg-gray-600 transition-colors"
                            >
                                <ChefHat className="w-5 h-5 mr-2 text-purple-400 group-hover:animate-spin-slow" />
                                {userProfile ? `Hello, ${userProfile.name}` : "Set up profile"}
                            </button>
                            )}
                        </div>
                    </div>
                    {renderPage()}
                </div>

                <audio ref={audioRef} className="hidden"></audio>
            </div>

            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap');

                .font-inter {
                    font-family: 'Inter', sans-serif;
                }
                .custom-scrollbar::-webkit-scrollbar {
                    width: 8px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: rgba(0, 0, 0, 0.1);
                    border-radius: 10px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: linear-gradient(to bottom, #8B5CF6, #EC4899);
                    border-radius: 10px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: linear-gradient(to bottom, #9F7AEA, #F472B6);
                }
                .custom-scrollbar-horizontal::-webkit-scrollbar {
                    height: 8px;
                }
                .custom-scrollbar-horizontal::-webkit-scrollbar-track {
                    background: rgba(0, 0, 0, 0.1);
                    border-radius: 10px;
                }
                .custom-scrollbar-horizontal::-webkit-scrollbar-thumb {
                    background: linear-gradient(to right, #8B5CF6, #EC4899);
                    border-radius: 10px;
                }
                .custom-scrollbar-horizontal::-webkit-scrollbar-thumb:hover {
                    background: linear-gradient(to right, #9F7AEA, #F472B6);
                }
                @keyframes pulse-slow {
                    0%, 100% {
                        opacity: 0.7;
                        transform: scale(1);
                    }
                    50% {
                        opacity: 1;
                        transform: scale(1.01);
                    }
                }
                .animate-pulse-slow {
                    animation: pulse-slow 4s infinite ease-in-out;
                }
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .animate-fade-in {
                    animation: fadeIn 0.5s ease-out forwards;
                }
                @keyframes bounce {
                    0%, 100% {
                        transform: translateY(-25%);
                        animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
                    }
                    50% {
                        transform: translateY(0);
                        animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
                    }
                }
                .animate-bounce {
                    animation: bounce 1s infinite;
                }
                @keyframes pulse-glow {
                    0% { box-shadow: 0 0 10px rgba(0, 255, 255, 0.2); }
                    50% { box-shadow: 0 0 15px rgba(0, 255, 255, 0.4); }
                    100% { box-shadow: 0 0 10px rgba(0, 255, 255, 0.2); }
                }
                @keyframes flicker {
                    0%, 100% { text-shadow: 0 0 5px #00f2f2, 0 0 10px #00f2f2, 0 0 20px rgba(0, 255, 255, 0.5); opacity: 1; }
                    50% { text-shadow: none; opacity: 0.8; }
                }
                @keyframes bar-animation {
                    0% { transform: scaleY(0.1); }
                    50% { transform: scaleY(1); }
                    100% { transform: scaleY(0.3); }
                }
                @keyframes spin-slow {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
                .group:hover .group-hover\:animate-spin-slow {
                    animation: spin-slow 2s linear infinite;
                }

                /* Custom CSS to override prose padding for bot messages */
                .bot-prose p,
                .bot-prose ul,
                .bot-prose ol,
                .bot-prose li,
                .bot-prose h1,
                .bot-prose h2,
                .bot-prose h3,
                .bot-prose h4,
                .bot-prose h5,
                .bot-prose h6 {
                    padding-left: 0 !important;
                    padding-right: 0 !important;
                    margin-left: 0 !important;
                    margin-right: 0 !important;
                }
            `}</style>
        </div>
    );
}



// Context for Firebase and User
const AppContext = createContext(null);

// ** NEW: Firestore Security Rules **
// The following security rules should be added to your Firebase project to ensure
// that users can only read and write to their own data.
/*
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
      match /{document=**} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }
    }
  }
}
*/

// Main App Component
const App = () => {
    const [db, setDb] = useState(null);
    const [auth, setAuth] = useState(null);
    const [userId, setUserId] = useState(null);
    const [loading, setLoading] = useState(true);
    const [currentPage, setCurrentPage] = useState('login'); // Start at login page
    const [showModal, setShowModal] = useState(false);
    const [modalContent, setModalContent] = useState('');
    const [modalAction, setModalAction] = useState(null);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [authView, setAuthView] = useState('login'); // 'login' or 'register'

    // Initialize Firebase and handle authentication
    useEffect(() => {
        const firebaseConfig = {
          apiKey: "AIzaSyAVL3l38f5njbfvhbLdZHvEEwLtOkNE9kE",
          authDomain: "diabetes-mitra-de5f8.firebaseapp.com",
          projectId: "diabetes-mitra-de5f8",
          storageBucket: "diabetes-mitra-de5f8.firebasestorage.app",
          messagingSenderId: "916099811993",
          appId: "1:916099811993:web:9ae0d4f89d8ce01ffd8608",
          measurementId: "G-JD0D5KTWKX"
        };
        
        try {
            const app = initializeApp(firebaseConfig);
            const firestore = getFirestore(app);
            const firebaseAuth = getAuth(app);

            setDb(firestore);
            setAuth(firebaseAuth);
            
            const unsubscribe = onAuthStateChanged(firebaseAuth, async (user) => {
                if (user) {
                    setIsAuthenticated(true);
                    setUserId(user.uid);
                    setCurrentPage('dashboard');
                    // Check if a user profile exists on login, if not, create one
                    await checkOrCreateUserProfile(firestore, user);
                } else {
                    setIsAuthenticated(false);
                    setUserId(null);
                    setCurrentPage('login');
                }
                setLoading(false);
            });

            return () => unsubscribe();
        } catch (error) {
            console.error("Failed to initialize Firebase app:", error);
            setLoading(false);
        }
    }, []);

    // NEW: Function to check and create a user profile document in Firestore
    const checkOrCreateUserProfile = async (firestore, user) => {
        const userDocRef = doc(firestore, `users/${user.uid}`);
        const userDocSnap = await getDoc(userDocRef);
        
        if (!userDocSnap.exists()) {
            await setDoc(userDocRef, {
                uid: user.uid,
                email: user.email,
                displayName: user.displayName || null,
                provider: user.providerData[0].providerId,
                createdAt: serverTimestamp(),
            });
            console.log("User profile created in Firestore.");
        }
    };

    // NEW: Authentication handlers
    const handleLogin = async (email, password) => {
        if (!auth) throw new Error("Authentication service is not available.");
        try {
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            if (!userCredential.user.emailVerified) {
                 // Throw a specific error code to be handled by the login page UI
                 throw { code: 'auth/email-not-verified', message: 'Email not verified.' };
            }
        } catch (error) {
            if (error.code === 'auth/wrong-password' || error.code === 'auth/user-not-found') {
                throw new Error('Invalid email or password.');
            }
            if (error.code === 'auth/email-not-verified') {
                throw error;
            }
            throw new Error(error.message || 'An unknown error occurred during login.');
        }
    };
    
    // NEW: Function to resend the verification email
    const handleResendVerification = async (email) => {
        if (!auth) throw new Error("Authentication service is not available.");
        try {
            const actionCodeSettings = {
                url: window.location.href, // This will return the user to the current page after verification
                handleCodeInApp: true,
            };
            // This requires a real user object, so we'll need to sign in again to get it.
            const userCredential = await signInWithEmailAndPassword(auth, email, 'temp-password'); // This might not work without a valid password
            if (userCredential.user) {
                await sendEmailVerification(userCredential.user);
                await signOut(auth);
                alert("Verification email resent! Please check your inbox."); // Re-added alert as a temporary fix
            }
        } catch (error) {
            if (error.code === 'auth/wrong-password') {
                alert("Please log in with the correct password first to resend the email.");
            } else {
                console.error("Error resending email:", error);
                alert("Failed to resend verification email. Please try again.");
            }
        }
    };

    const handleRegister = async (email, password) => {
        if (!auth) throw new Error("Authentication service is not available.");
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await sendEmailVerification(userCredential.user);
    };

    const handleGoogleLogin = async () => {
        if (!auth) throw new Error("Authentication service is not available.");
        const provider = new GoogleAuthProvider();
        await signInWithPopup(auth, provider);
    };

    const handleLogout = async () => {
        if (!auth) throw new Error("Authentication service is not available.");
        await signOut(auth);
    };

    const showCustomModal = (content, action = null) => {
        setModalContent(content);
        setModalAction(() => action);
        setShowModal(true);
    };

    const closeCustomModal = () => {
        setShowModal(false);
        setModalContent('');
        setModalAction(null);
    };

    const CustomModal = ({ content, onConfirm, onCancel }) => (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-75 flex items-center justify-center z-50">
            <div className="bg-white p-6 rounded-lg shadow-xl max-w-sm w-full">
                <p className="text-lg mb-4 text-center">{content}</p>
                <div className="flex justify-center space-x-4">
                    {onConfirm && (
                        <button
                            onClick={() => { onConfirm && onConfirm(); onCancel(); }}
                            className="bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-4 rounded-md transition duration-300"
                        >
                            Confirm
                        </button>
                    )}
                    <button
                        onClick={onCancel}
                        className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-4 rounded-md transition duration-300"
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-100">
                <Loader2 className="animate-spin text-blue-500 w-12 h-12" />
                <p className="ml-3 text-lg text-gray-700">Loading application...</p>
            </div>
        );
    }

    const renderPage = () => {
        if (!isAuthenticated) {
            if (currentPage === 'register') {
                return <RegisterPage onNavigate={setCurrentPage} onRegister={handleRegister} onGoogleLogin={handleGoogleLogin} />;
            }
            return <LoginPage onNavigate={setCurrentPage} onLogin={handleLogin} onGoogleLogin={handleGoogleLogin} onResendVerification={handleResendVerification} />;
        }
        
        switch (currentPage) {
            case 'dashboard':
                return <Dashboard />;
            case 'glucose':
                return <GlucoseTracker showCustomModal={showCustomModal} />;
            case 'food':
                return <FoodTracker showCustomModal={showCustomModal} />;
            case 'exercise':
                return <ExerciseTracker showCustomModal={showCustomModal} />;
            case 'history':
                return <HistoryPage showCustomModal={showCustomModal} />;
            case 'imageAnalysis':
                return <ImageAnalysis showCustomModal={showCustomModal} />;
            case 'imageAnalysisHistory':
                return <ImageAnalysisHistory showCustomModal={showCustomModal} />;
            case 'goals':
                return <GoalsPage showCustomModal={showCustomModal} />;
            case 'chatbot':
                return <NutriBotApp isAuthenticated={isAuthenticated} userId={userId} />;
            default:
                return <Dashboard />;
        }
    };

    return (
        <AppContext.Provider value={{ db, auth, userId, showCustomModal, isAuthenticated }}>
            <div className="min-h-screen bg-gray-50 font-inter text-gray-800 flex flex-col">
                <header className="bg-gradient-to-r from-blue-600 to-blue-800 text-white p-4 shadow-lg">
                    <div className="container mx-auto flex justify-between items-center">
                        <h1 className="text-3xl font-bold rounded-md px-2 py-1 bg-white bg-opacity-20">Diabetes Mitra</h1>
                        {userId && (
                            <div className="text-sm bg-white bg-opacity-20 px-3 py-1 rounded-full flex items-center">
                                <span className="mr-2">User ID:</span>
                                <span className="font-mono text-xs truncate">{userId}</span>
                            </div>
                        )}
                        {isAuthenticated && (
                            <button onClick={handleLogout} className="p-2 rounded-full text-white bg-white bg-opacity-20 hover:bg-opacity-30 transition-colors">
                                <LogOut className="w-5 h-5" />
                            </button>
                        )}
                    </div>
                </header>

                <main className="flex-grow container mx-auto p-4 md:p-6 mb-20 md:mb-0">
                    {renderPage()}
                </main>

                <nav className="bg-white shadow-lg p-3 fixed bottom-0 left-0 right-0 z-40 md:relative md:p-0 md:shadow-none">
                    <div className="container mx-auto flex justify-around items-center flex-wrap">
                        {isAuthenticated && (
                            <>
                                <NavItem icon={<Home className="w-6 h-6" />} label="Dashboard" onClick={() => setCurrentPage('dashboard')} active={currentPage === 'dashboard'} />
                                <NavItem icon={<Droplet className="w-6 h-6" />} label="Glucose" onClick={() => setCurrentPage('glucose')} active={currentPage === 'glucose'} />
                                <NavItem icon={<Utensils className="w-6 h-6" />} label="Food" onClick={() => setCurrentPage('food')} active={currentPage === 'food'} />
                                <NavItem icon={<Activity className="w-6 h-6" />} label="Exercise" onClick={() => setCurrentPage('exercise')} active={currentPage === 'exercise'} />
                                <NavItem icon={<Target className="w-6 h-6" />} label="Goals" onClick={() => setCurrentPage('goals')} active={currentPage === 'goals'} />
                                <NavItem icon={<Camera className="w-6 h-6" />} label="Analyze Food" onClick={() => setCurrentPage('imageAnalysis')} active={currentPage === 'imageAnalysis'} />
                                <NavItem icon={<History className="w-6 h-6" />} label="History" onClick={() => setCurrentPage('history')} active={currentPage === 'history'} />
                                <NavItem icon={<Camera className="w-6 h-6" />} label="Image History" onClick={() => setCurrentPage('imageAnalysisHistory')} active={currentPage === 'imageAnalysisHistory'} />
                                <NavItem icon={<Bot className="w-6 h-6" />} label="AI Assistant" onClick={() => setCurrentPage('chatbot')} active={currentPage === 'chatbot'} />
                            </>
                        )}
                        {!isAuthenticated && (
                            <>
                                <NavItem icon={<LogIn className="w-6 h-6" />} label="Login" onClick={() => { setCurrentPage('login'); setAuthView('login'); }} active={currentPage === 'login'} />
                                <NavItem icon={<UserPlus className="w-6 h-6" />} label="Register" onClick={() => { setCurrentPage('register'); setAuthView('register'); }} active={currentPage === 'register'} />
                            </>
                        )}
                    </div>
                </nav>

                {showModal && (
                    <CustomModal
                        content={modalContent}
                        onConfirm={modalAction}
                        onCancel={closeCustomModal}
                    />
                )}
            </div>
        </AppContext.Provider>
    );
};

// Navigation Item Component
const NavItem = ({ icon, label, onClick, active }) => (
    <button
        onClick={onClick}
        className={`flex flex-col items-center p-2 rounded-lg transition-colors duration-200 ${active ? 'text-blue-600 bg-blue-50' : 'text-gray-600 hover:text-blue-500 hover:bg-gray-100'}`}
    >
        {icon}
        <span className="text-xs mt-1">{label}</span>
    </button>
);

// Dashboard Component
const Dashboard = () => {
    const { db, userId, isAuthenticated } = useContext(AppContext);
    const [glucoseReadings, setGlucoseReadings] = useState([]);
    const [foodEntries, setFoodEntries] = useState([]);
    const [exerciseEntries, setExerciseEntries] = useState([]);
    const [goals, setGoals] = useState([]);
    const [latestImageAnalysisData, setLatestImageAnalysisData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!db || !userId || !isAuthenticated) {
            setLoading(false);
            return;
        }

        setLoading(true);
        const userGlucosePath = `users/${userId}/glucoseReadings`;
        const userFoodPath = `users/${userId}/foodEntries`;
        const userExercisePath = `users/${userId}/exerciseEntries`;
        const userImageAnalysisPath = `users/${userId}/imageAnalysisHistory`;
        const userGoalsPath = `users/${userId}/goals`;

        const unsubscribers = [];

        unsubscribers.push(onSnapshot(query(collection(db, userGlucosePath)), (snapshot) => {
            const readings = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            readings.sort((a, b) => new Date(b.date + ' ' + b.time) - new Date(a.date + ' ' + a.time));
            setGlucoseReadings(readings);
        }));

        unsubscribers.push(onSnapshot(query(collection(db, userFoodPath)), (snapshot) => {
            const entries = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            entries.sort((a, b) => new Date(b.date + ' ' + b.time) - new Date(a.date + ' ' + a.time));
            setFoodEntries(entries);
        }));

        unsubscribers.push(onSnapshot(query(collection(db, userExercisePath)), (snapshot) => {
            const entries = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            entries.sort((a, b) => new Date(b.date + ' ' + b.time) - new Date(a.date + ' ' + a.time));
            setExerciseEntries(entries);
        }));
        
        unsubscribers.push(onSnapshot(query(collection(db, userGoalsPath)), (snapshot) => {
            const fetchedGoals = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setGoals(fetchedGoals);
        }));

        unsubscribers.push(onSnapshot(query(collection(db, userImageAnalysisPath), orderBy('timestamp', 'desc')), (snapshot) => {
            if (!snapshot.empty) {
                setLatestImageAnalysisData(snapshot.docs[0].data());
            } else {
                setLatestImageAnalysisData(null);
            }
        }));

        setLoading(false);

        return () => unsubscribers.forEach(unsub => unsub());
    }, [db, userId, isAuthenticated]);

    const calculateCurrentValue = (goal) => {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const today = new Date().toISOString().slice(0, 10);

        switch (goal.type) {
            case 'avgGlucose':
                const recentReadings = glucoseReadings.filter(r => new Date(r.date) >= sevenDaysAgo);
                if (recentReadings.length === 0) return 0;
                const sum = recentReadings.reduce((acc, curr) => acc + parseFloat(curr.value), 0);
                return (sum / recentReadings.length);
            case 'dailyCarbs':
                const todayFoodCarbs = foodEntries.filter(e => e.date === today);
                return todayFoodCarbs.reduce((acc, curr) => acc + parseFloat(curr.carbohydrates || 0), 0);
            case 'dailyCalories':
                const todayFoodCalories = foodEntries.filter(e => e.date === today);
                return todayFoodCalories.reduce((acc, curr) => acc + parseFloat(curr.calories || 0), 0);
            case 'dailySugars':
                const todayFoodSugars = foodEntries.filter(e => e.date === today);
                return todayFoodSugars.reduce((acc, curr) => acc + parseFloat(curr.sugars || 0), 0);
            case 'weeklyExercise':
                const recentExercise = exerciseEntries.filter(e => new Date(e.date) >= sevenDaysAgo);
                return recentExercise.reduce((acc, curr) => acc + parseFloat(curr.duration || 0), 0);
            default:
                return 0;
        }
    };

    const latestGlucose = glucoseReadings.length > 0 ? glucoseReadings[0] : null;

    const getAverageGlucose = () => {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const recentReadings = glucoseReadings.filter(reading => new Date(reading.date) >= sevenDaysAgo);
        if (recentReadings.length === 0) return 'N/A';
        const sum = recentReadings.reduce((acc, curr) => acc + parseFloat(curr.value), 0);
        return (sum / recentReadings.length).toFixed(2);
    };

    const getTodayCarbs = () => {
        const today = new Date().toISOString().slice(0, 10);
        const todayFood = foodEntries.filter(entry => entry.date === today);
        return todayFood.reduce((acc, curr) => acc + parseFloat(curr.carbohydrates || 0), 0).toFixed(1);
    };

    const getTodayExerciseDuration = () => {
        const today = new Date().toISOString().slice(0, 10);
        const todayExercise = exerciseEntries.filter(entry => entry.date === today);
        return todayExercise.reduce((acc, curr) => acc + parseFloat(curr.duration || 0), 0).toFixed(0);
    };

    const glucoseDataForChart = (() => {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const dailyAverages = {};
        glucoseReadings.filter(r => new Date(r.date) >= sevenDaysAgo).forEach(reading => {
            const date = reading.date;
            if (!dailyAverages[date]) dailyAverages[date] = { sum: 0, count: 0 };
            dailyAverages[date].sum += parseFloat(reading.value);
            dailyAverages[date].count++;
        });
        const chartData = Object.keys(dailyAverages).map(date => ({
            date: date.slice(5),
            value: (dailyAverages[date].sum / dailyAverages[date].count).toFixed(2)
        }));
        chartData.sort((a, b) => new Date(`2000-${a.date}`) - new Date(`2000-${b.date}`));
        return chartData;
    })();

    if (loading) {
        return (
            <div className="flex items-center justify-center p-8">
                <Loader2 className="animate-spin text-blue-500 w-8 h-8" />
                <p className="ml-2 text-gray-600">Loading dashboard data...</p>
            </div>
        );
    }

    const analyzedTotals = (() => {
        if (!latestImageAnalysisData || !latestImageAnalysisData.foodItems) {
            return { carbs: 0, sugars: 0, calories: 0, suitability: 'N/A' };
        }
        const totalCarbs = latestImageAnalysisData.foodItems.reduce((sum, item) => sum + (item.carbohydrates_g || 0), 0);
        const totalSugars = latestImageAnalysisData.foodItems.reduce((sum, item) => sum + (item.sugars_g || 0), 0);
        const totalCalories = latestImageAnalysisData.foodItems.reduce((sum, item) => sum + (item.calories_kcal || 0), 0);
        return {
            carbs: totalCarbs,
            sugars: totalSugars,
            calories: totalCalories,
        };
    })();

    return (
        <div className="space-y-6">
            <h2 className="text-3xl font-bold text-gray-800 mb-6 text-center">Your Diabetes Dashboard</h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <StatCard
                    title="Latest Glucose"
                    value={latestGlucose ? `${latestGlucose.value} mg/dL` : 'No data'}
                    description={latestGlucose ? `On ${latestGlucose.date}` : 'Add a reading!'}
                    icon={<Droplet className="w-8 h-8 text-blue-600" />}
                />
                <StatCard
                    title="7-Day Avg. Glucose"
                    value={`${getAverageGlucose()} mg/dL`}
                    description="Average over last 7 days"
                    icon={<Calendar className="w-8 h-8 text-green-600" />}
                />
                <StatCard
                    title="Today's Carbs"
                    value={`${getTodayCarbs()} g`}
                    description="Total carbohydrates today"
                    icon={<Utensils className="w-8 h-8 text-orange-600" />}
                />
                <StatCard
                    title="Today's Exercise"
                    value={`${getTodayExerciseDuration()} min`}
                    description="Total exercise duration today"
                    icon={<Activity className="w-8 h-8 text-purple-600" />}
                />
                 <StatCard
                    title="Analyzed Calories"
                    value={`${analyzedTotals.calories.toFixed(0)} kcal`}
                    description={latestImageAnalysisData ? `From latest food analysis` : 'Analyze food for data!'}
                    icon={<Flame className="w-8 h-8 text-red-600" />}
                />
                <StatCard
                    title="Analyzed Sugars"
                    value={`${analyzedTotals.sugars.toFixed(1)} g`}
                    description={latestImageAnalysisData ? `From latest food analysis` : 'Analyze food for data!'}
                    icon={<Candy className="w-8 h-8 text-pink-600" />}
                />
            </div>

            {/* Goal Progress Section */}
            {goals.length > 0 && (
                <div className="bg-white p-6 rounded-xl shadow-md">
                    <h3 className="text-2xl font-semibold text-gray-800 mb-4">Goal Progress</h3>
                    <div className="space-y-4">
                        {goals.slice(0, 3).map(goal => {
                            const currentValue = calculateCurrentValue(goal);
                            const progress = goal.targetValue > 0 ? (currentValue / goal.targetValue) * 100 : 0;
                            const isExceeded = goal.lowerIsBetter && currentValue > goal.targetValue;
                            
                            let progressColor = 'bg-blue-500';
                            if (isExceeded) {
                                progressColor = 'bg-red-500';
                            } else if ((!goal.lowerIsBetter && progress >= 100) || (goal.lowerIsBetter && progress <= 100 && currentValue > 0)) {
                                progressColor = 'bg-green-500';
                            }

                            return (
                                <div key={goal.id}>
                                    <div className="flex justify-between items-center mb-1">
                                        <span className="font-medium text-gray-700">{goal.title}</span>
                                        <span className="text-sm font-semibold text-gray-600">
                                            {currentValue.toFixed(1)} / {goal.targetValue} {goal.unit}
                                        </span>
                                    </div>
                                    <div className="w-full bg-gray-200 rounded-full h-2.5">
                                        <div
                                            className={`${progressColor} h-2.5 rounded-full transition-all duration-500`}
                                            style={{ width: `${goal.lowerIsBetter ? Math.min(progress, 100) : Math.min(progress, 100)}%` }}
                                        ></div>
                                    </div>
                                    {isExceeded && <p className="text-xs text-red-600 mt-1">Goal exceeded!</p>}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            <div className="bg-white p-6 rounded-xl shadow-md">
                <h3 className="text-2xl font-semibold text-gray-800 mb-4">7-Day Glucose Trend</h3>
                {glucoseDataForChart.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={glucoseDataForChart}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                            <XAxis dataKey="date" />
                            <YAxis label={{ value: 'mg/dL', angle: -90, position: 'insideLeft' }} />
                            <Tooltip />
                            <Legend />
                            <Line type="monotone" dataKey="value" stroke="#3b82f6" activeDot={{ r: 8 }} name="Avg. Glucose" />
                        </LineChart>
                    </ResponsiveContainer>
                ) : (
                    <p className="text-gray-500 text-center py-4">No glucose data for the last 7 days.</p>
                )}
            </div>

            <div className="bg-white p-6 rounded-xl shadow-md">
                <h3 className="text-2xl font-semibold text-gray-800 mb-4">Recent Activity</h3>
                <div className="space-y-4">
                    {glucoseReadings.slice(0, 2).map(r => <ActivityItem key={r.id} type="Glucose" value={`${r.value} mg/dL`} date={`${r.date} ${r.time}`} icon={<Droplet className="text-blue-500" />} />)}
                    {foodEntries.slice(0, 2).map(e => <ActivityItem key={e.id} type="Food" value={`${e.item} (${e.carbohydrates}g)`} date={`${e.date} ${e.time}`} icon={<Utensils className="text-orange-500" />} />)}
                    {exerciseEntries.slice(0, 2).map(e => <ActivityItem key={e.id} type="Exercise" value={`${e.type} (${e.duration} min)`} date={`${e.date} ${e.time}`} icon={<Activity className="text-purple-500" />} />)}
                    {glucoseReadings.length === 0 && foodEntries.length === 0 && exerciseEntries.length === 0 && (
                        <p className="text-gray-500 text-center py-4">No recent activity. Start logging!</p>
                    )}
                </div>
            </div>
        </div>
    );
};

// Stat Card Component
const StatCard = ({ title, value, description, icon }) => (
    <div className="bg-white p-6 rounded-xl shadow-md flex items-center space-x-4">
        <div className="p-3 bg-blue-100 rounded-full">
            {icon}
        </div>
        <div>
            <h3 className="text-lg font-medium text-gray-600">{title}</h3>
            <p className="text-3xl font-bold text-gray-900">{value}</p>
            <p className="text-sm text-gray-500 mt-1">{description}</p>
        </div>
    </div>
);

// Activity Item Component for Dashboard
const ActivityItem = ({ type, value, date, icon }) => (
    <div className="flex items-start p-4 bg-gray-50 rounded-lg shadow-sm">
        <div className="mr-3 mt-1 flex-shrink-0">{React.cloneElement(icon, { className: `${icon.props.className} w-5 h-5` })}</div>
        <div className="flex-grow">
            <p className="font-semibold text-gray-800">{type}: {value}</p>
            <p className="text-sm text-gray-500">{date}</p>
        </div>
    </div>
);

// Goals Page Component
const GoalsPage = ({ showCustomModal }) => {
    const { db, userId, isAuthenticated } = useContext(AppContext);
    const [goals, setGoals] = useState([]);
    const [data, setData] = useState({ glucose: [], food: [], exercise: [] });
    const [loading, setLoading] = useState(true);
    const [newGoalType, setNewGoalType] = useState('avgGlucose');
    const [newGoalTarget, setNewGoalTarget] = useState('');

    const goalTypes = {
        avgGlucose: { title: '7-Day Average Glucose', unit: 'mg/dL', lowerIsBetter: true },
        dailyCarbs: { title: 'Daily Carbohydrate Intake', unit: 'g', lowerIsBetter: true },
        dailyCalories: { title: 'Daily Calorie Intake', unit: 'kcal', lowerIsBetter: true },
        dailySugars: { title: 'Daily Sugar Intake', unit: 'g', lowerIsBetter: true },
        weeklyExercise: { title: 'Weekly Exercise Duration', unit: 'min', lowerIsBetter: false },
    };

    useEffect(() => {
        if (!db || !userId || !isAuthenticated) {
            setLoading(false);
            return;
        }
        setLoading(true);
        const paths = {
            goals: `users/${userId}/goals`,
            glucose: `users/${userId}/glucoseReadings`,
            food: `users/${userId}/foodEntries`,
            exercise: `users/${userId}/exerciseEntries`,
        };

        const unsubscribers = [
            onSnapshot(collection(db, paths.goals), snapshot => setGoals(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })))),
            onSnapshot(collection(db, paths.glucose), snapshot => setData(prev => ({ ...prev, glucose: snapshot.docs.map(doc => doc.data()) }))),
            onSnapshot(collection(db, paths.food), snapshot => setData(prev => ({ ...prev, food: snapshot.docs.map(doc => doc.data()) }))),
            onSnapshot(collection(db, paths.exercise), snapshot => setData(prev => ({ ...prev, exercise: snapshot.docs.map(doc => doc.data()) }))),
        ];

        setLoading(false);
        return () => unsubscribers.forEach(unsub => unsub());
    }, [db, userId, isAuthenticated]);

    const calculateCurrentValue = (goal) => {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const today = new Date().toISOString().slice(0, 10);

        switch (goal.type) {
            case 'avgGlucose':
                const recentReadings = data.glucose.filter(r => new Date(r.date) >= sevenDaysAgo);
                if (recentReadings.length === 0) return 0;
                const sum = recentReadings.reduce((acc, curr) => acc + parseFloat(curr.value), 0);
                return sum / recentReadings.length;
            case 'dailyCarbs':
                const todayFoodCarbs = data.food.filter(e => e.date === today);
                return todayFoodCarbs.reduce((acc, curr) => acc + parseFloat(curr.carbohydrates || 0), 0);
            case 'dailyCalories':
                const todayFoodCalories = data.food.filter(e => e.date === today);
                return todayFoodCalories.reduce((acc, curr) => acc + parseFloat(curr.calories || 0), 0);
            case 'dailySugars':
                const todayFoodSugars = data.food.filter(e => e.date === today);
                return todayFoodSugars.reduce((acc, curr) => acc + parseFloat(curr.sugars || 0), 0);
            case 'weeklyExercise':
                const recentExercise = data.exercise.filter(e => new Date(e.date) >= sevenDaysAgo);
                return recentExercise.reduce((acc, curr) => acc + parseFloat(curr.duration || 0), 0);
            default:
                return 0;
        }
    };

    const handleSetGoal = async (e) => {
        e.preventDefault();
        if (!newGoalTarget || isNaN(parseFloat(newGoalTarget)) || parseFloat(newGoalTarget) <= 0) {
            showCustomModal("Please enter a valid, positive target value.");
            return;
        }

        const goalsCollectionRef = collection(db, `users/${userId}/goals`);
        
        const q = query(goalsCollectionRef, where("type", "==", newGoalType));
        const existingGoals = await getDocs(q);
        if (!existingGoals.empty) {
            showCustomModal(`A goal for "${goalTypes[newGoalType].title}" already exists. Please delete the old one first.`);
            return;
        }

        const newGoal = {
            type: newGoalType,
            title: goalTypes[newGoalType].title,
            targetValue: parseFloat(newGoalTarget),
            unit: goalTypes[newGoalType].unit,
            lowerIsBetter: goalTypes[newGoalType].lowerIsBetter,
            createdAt: new Date().toISOString(),
        };

        try {
            await addDoc(goalsCollectionRef, newGoal);
            showCustomModal("Goal set successfully!");
            setNewGoalTarget('');
        } catch (error) {
            console.error("Error setting goal:", error);
            showCustomModal("Failed to set goal. Please try again.");
        }
    };

    const handleDeleteGoal = (id) => {
        showCustomModal("Are you sure you want to delete this goal?", async () => {
            try {
                await deleteDoc(doc(db, `users/${userId}/goals`, id));
                showCustomModal("Goal deleted successfully!");
            } catch (error) {
                console.error("Error deleting goal:", error);
                showCustomModal("Failed to delete goal. Please try again.");
            }
        });
    };

    if (loading) {
        return <div className="flex justify-center p-8"><Loader2 className="animate-spin w-8 h-8 text-blue-500" /></div>;
    }

    return (
        <div className="space-y-6">
            <h2 className="text-3xl font-bold text-gray-800 mb-6 text-center">Set & Track Your Goals</h2>

            <div className="bg-white p-6 rounded-xl shadow-md">
                <h3 className="text-2xl font-semibold text-gray-800 mb-4">Set a New Goal</h3>
                <form onSubmit={handleSetGoal} className="space-y-4">
                    <div>
                        <label htmlFor="goalType" className="block text-sm font-medium text-gray-700">Goal Type</label>
                        <select
                            id="goalType"
                            value={newGoalType}
                            onChange={(e) => setNewGoalType(e.target.value)}
                            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500"
                        >
                            {Object.entries(goalTypes).map(([key, { title }]) => (
                                <option key={key} value={key}>{title}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="goalTarget" className="block text-sm font-medium text-gray-700">Target Value ({goalTypes[newGoalType].unit})</label>
                        <input
                            type="number"
                            id="goalTarget"
                            value={newGoalTarget}
                            onChange={(e) => setNewGoalTarget(e.target.value)}
                            placeholder={`e.g., ${newGoalType === 'avgGlucose' ? 140 : (newGoalType === 'dailyCarbs' ? 150 : 150)}`}
                            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500"
                            required
                        />
                    </div>
                    <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-md shadow-md flex items-center justify-center">
                        <Target className="w-5 h-5 mr-2" /> Set Goal
                    </button>
                </form>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-md">
                <h3 className="text-2xl font-semibold text-gray-800 mb-4">Your Active Goals</h3>
                {goals.length === 0 ? (
                    <p className="text-gray-500 text-center py-4">No goals set yet. Add one above to get started!</p>
                ) : (
                    <div className="space-y-6">
                        {goals.map(goal => {
                            const currentValue = calculateCurrentValue(goal);
                            const progress = goal.targetValue > 0 ? (currentValue / goal.targetValue) * 100 : 0;
                            const isExceeded = goal.lowerIsBetter && currentValue > goal.targetValue;
                            
                            let progressColor = 'bg-blue-500';
                            if (isExceeded) {
                                progressColor = 'bg-red-500';
                            } else if ((!goal.lowerIsBetter && progress >= 100) || (goal.lowerIsBetter && progress <= 100 && currentValue > 0)) {
                                progressColor = 'bg-green-500';
                            }

                            return (
                                <div key={goal.id} className="p-4 border border-gray-200 rounded-lg">
                                    <div className="flex justify-between items-start">
                                        <h4 className="text-lg font-bold text-gray-800">{goal.title}</h4>
                                        <button onClick={() => handleDeleteGoal(goal.id)} className="p-1 text-red-500 hover:text-red-700"><Trash2 className="w-5 h-5" /></button>
                                    </div>
                                    <p className="text-sm text-gray-500 mb-2">Target: {goal.lowerIsBetter ? '< ' : ''}{goal.targetValue} {goal.unit}</p>
                                    
                                    <div className="flex justify-between items-center mb-1 text-sm">
                                        <span className="font-medium text-gray-700">Current: {currentValue.toFixed(1)} {goal.unit}</span>
                                        <span className="font-semibold">{Math.min(progress, 100).toFixed(0)}%</span>
                                    </div>
                                    <div className="w-full bg-gray-200 rounded-full h-4">
                                        <div
                                            className={`${progressColor} h-4 rounded-full transition-all duration-500 flex items-center justify-center text-white text-xs font-bold`}
                                            style={{ width: `${goal.lowerIsBetter ? Math.min(progress, 100) : Math.min(progress, 100)}%` }}
                                        >
                                            {currentValue.toFixed(1)}
                                        </div>
                                    </div>
                                    {isExceeded && <p className="text-xs text-red-600 mt-1 text-right">Target exceeded!</p>}
                                    {!isExceeded && progress >= 100 && !goal.lowerIsBetter && <p className="text-xs text-green-600 mt-1 text-right">Goal achieved!</p>}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};

// Glucose Tracker Component
const GlucoseTracker = ({ showCustomModal }) => {
    const { db, userId, isAuthenticated } = useContext(AppContext);
    const [glucoseValue, setGlucoseValue] = useState('');
    const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
    const [time, setTime] = useState(new Date().toTimeString().slice(0, 5));
    const [notes, setNotes] = useState('');
    const [readings, setReadings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editingId, setEditingId] = useState(null);

    useEffect(() => {
        if (!db || !userId || !isAuthenticated) {
            setLoading(false);
            return;
        }

        setLoading(true);
        const userGlucosePath = `users/${userId}/glucoseReadings`;

        const q = query(collection(db, userGlucosePath), orderBy('timestamp', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetchedReadings = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setReadings(fetchedReadings);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching glucose readings:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [db, userId, isAuthenticated]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!glucoseValue || !date || !time) {
            showCustomModal("Please fill in all required fields.");
            return;
        }
        if (isNaN(parseFloat(glucoseValue)) || parseFloat(glucoseValue) <= 0) {
            showCustomModal("Glucose value must be a positive number.");
            return;
        }

        const readingData = {
            value: parseFloat(glucoseValue),
            date,
            time,
            notes,
            timestamp: new Date().toISOString()
        };

        try {
            const userGlucosePath = `users/${userId}/glucoseReadings`;

            if (editingId) {
                await updateDoc(doc(db, userGlucosePath, editingId), readingData);
                showCustomModal("Glucose reading updated successfully!");
                setEditingId(null);
            } else {
                await addDoc(collection(db, userGlucosePath), readingData);
                showCustomModal("Glucose reading added successfully!");
            }
            setGlucoseValue('');
            setNotes('');
            setDate(new Date().toISOString().slice(0, 10));
            setTime(new Date().toTimeString().slice(0, 5));
        } catch (error) {
            console.error("Error adding/updating glucose reading:", error);
            showCustomModal("Failed to save glucose reading. Please try again.");
        }
    };

    const handleEdit = (reading) => {
        setEditingId(reading.id);
        setGlucoseValue(reading.value);
        setDate(reading.date);
        setTime(reading.time);
        setNotes(reading.notes || '');
    };

    const handleDelete = (id) => {
        showCustomModal("Are you sure you want to delete this glucose reading?", async () => {
            try {
                const userGlucosePath = `users/${userId}/glucoseReadings`;
                await deleteDoc(doc(db, userGlucosePath, id));
                showCustomModal("Glucose reading deleted successfully!");
            } catch (error) {
                console.error("Error deleting glucose reading:", error);
                showCustomModal("Failed to delete glucose reading. Please try again.");
            }
        });
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center p-8">
                <Loader2 className="animate-spin text-blue-500 w-8 h-8" />
                <p className="ml-2 text-gray-600">Loading glucose readings...</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <h2 className="text-3xl font-bold text-gray-800 mb-6 text-center">Track Your Blood Glucose</h2>

            {/* Input Form */}
            <div className="bg-white p-6 rounded-xl shadow-md">
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label htmlFor="glucoseValue" className="block text-sm font-medium text-gray-700">Glucose Value (mg/dL)</label>
                        <input
                            type="number"
                            id="glucoseValue"
                            value={glucoseValue}
                            onChange={(e) => setGlucoseValue(e.target.value)}
                            placeholder="e.g., 120"
                            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500"
                            required
                        />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label htmlFor="glucoseDate" className="block text-sm font-medium text-gray-700">Date</label>
                            <input
                                type="date"
                                id="glucoseDate"
                                value={date}
                                onChange={(e) => setDate(e.target.value)}
                                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500"
                                required
                            />
                        </div>
                        <div>
                            <label htmlFor="glucoseTime" className="block text-sm font-medium text-gray-700">Time</label>
                            <input
                                type="time"
                                id="glucoseTime"
                                value={time}
                                onChange={(e) => setTime(e.target.value)}
                                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500"
                                required
                            />
                        </div>
                    </div>
                    <div>
                        <label htmlFor="glucoseNotes" className="block text-sm font-medium text-gray-700">Notes (Optional)</label>
                        <textarea
                            id="glucoseNotes"
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            rows="3"
                            placeholder="e.g., Before breakfast, After meal, Feeling low"
                            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500"
                        ></textarea>
                    </div>
                    <button
                        type="submit"
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-md shadow-md transition duration-300 flex items-center justify-center"
                    >
                        {editingId ? <><Edit className="w-5 h-5 mr-2" /> Update Reading</> : <><PlusCircle className="w-5 h-5 mr-2" /> Add Reading</>}
                    </button>
                    {editingId && (
                        <button
                            type="button"
                            onClick={() => { setEditingId(null); setGlucoseValue(''); setNotes(''); setDate(new Date().toISOString().slice(0, 10)); setTime(new Date().toTimeString().slice(0, 5)); }}
                            className="w-full bg-gray-400 hover:bg-gray-500 text-white font-bold py-2 px-4 rounded-md shadow-md transition duration-300 mt-2"
                        >
                            Cancel Edit
                        </button>
                    )}
                </form>
            </div>

            {/* Recent Readings List */}
            <div className="bg-white p-6 rounded-xl shadow-md">
                <h3 className="text-2xl font-semibold text-gray-800 mb-4">Recent Glucose Readings</h3>
                {readings.length === 0 ? (
                    <p className="text-gray-500 text-center py-4">No glucose readings yet. Add one above!</p>
                ) : (
                    <ul className="divide-y divide-gray-200">
                        {readings.slice(0, 5).map((reading) => (
                            <li key={reading.id} className="py-3 flex justify-between items-center">
                                <div>
                                    <p className="text-lg font-medium text-gray-900">{reading.value} mg/dL</p>
                                    <p className="text-sm text-gray-500">{reading.date} at {reading.time}</p>
                                    {reading.notes && <p className="text-sm text-gray-600 italic">Notes: {reading.notes}</p>}
                                </div>
                                <div className="flex space-x-2">
                                    <button
                                        onClick={() => handleEdit(reading)}
                                        className="p-2 rounded-full bg-blue-100 text-blue-600 hover:bg-blue-200 transition-colors"
                                        title="Edit"
                                    >
                                        <Edit className="w-5 h-5" />
                                    </button>
                                    <button
                                        onClick={() => handleDelete(reading.id)}
                                        className="p-2 rounded-full bg-red-100 text-red-600 hover:bg-red-200 transition-colors"
                                        title="Delete"
                                    >
                                        <Trash2 className="w-5 h-5" />
                                    </button>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
};

// Food Tracker Component
const FoodTracker = ({ showCustomModal }) => {
    const { db, userId, isAuthenticated } = useContext(AppContext);
    const [item, setItem] = useState('');
    const [carbohydrates, setCarbohydrates] = useState('');
    const [calories, setCalories] = useState('');
    const [sugars, setSugars] = useState('');
    const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
    const [time, setTime] = useState(new Date().toTimeString().slice(0, 5));
    const [notes, setNotes] = useState('');
    const [foodEntries, setFoodEntries] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editingId, setEditingId] = useState(null);

    useEffect(() => {
        if (!db || !userId || !isAuthenticated) {
            setLoading(false);
            return;
        }

        setLoading(true);
        const userFoodPath = `users/${userId}/foodEntries`;

        const q = query(collection(db, userFoodPath), orderBy('timestamp', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetchedEntries = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setFoodEntries(fetchedEntries);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching food entries:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [db, userId, isAuthenticated]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!item || !carbohydrates || !date || !time) {
            showCustomModal("Please fill in all required fields.");
            return;
        }
        if (isNaN(parseFloat(carbohydrates)) || parseFloat(carbohydrates) < 0) {
            showCustomModal("Carbohydrates must be a non-negative number.");
            return;
        }

        const entryData = {
            item,
            carbohydrates: parseFloat(carbohydrates),
            calories: calories ? parseFloat(calories) : 0,
            sugars: sugars ? parseFloat(sugars) : 0,
            date,
            time,
            notes,
            timestamp: new Date().toISOString()
        };

        try {
            const userFoodPath = `users/${userId}/foodEntries`;

            if (editingId) {
                await updateDoc(doc(db, userFoodPath, editingId), entryData);
                showCustomModal("Food entry updated successfully!");
                setEditingId(null);
            } else {
                await addDoc(collection(db, userFoodPath), entryData);
                showCustomModal("Food entry added successfully!");
            }
            setItem('');
            setCarbohydrates('');
            setCalories('');
            setSugars('');
            setNotes('');
            setDate(new Date().toISOString().slice(0, 10));
            setTime(new Date().toTimeString().slice(0, 5));
        } catch (error) {
            console.error("Error adding/updating food entry:", error);
            showCustomModal("Failed to save food entry. Please try again.");
        }
    };

    const handleEdit = (entry) => {
        setEditingId(entry.id);
        setItem(entry.item);
        setCarbohydrates(entry.carbohydrates);
        setCalories(entry.calories || '');
        setSugars(entry.sugars || '');
        setDate(entry.date);
        setTime(entry.time);
        setNotes(entry.notes || '');
    };

    const handleDelete = (id) => {
        showCustomModal("Are you sure you want to delete this food entry?", async () => {
            try {
                const userFoodPath = `users/${userId}/foodEntries`;
                await deleteDoc(doc(db, userFoodPath, id));
                showCustomModal("Food entry deleted successfully!");
            } catch (error) {
                console.error("Error deleting food entry:", error);
                showCustomModal("Failed to delete food entry. Please try again.");
            }
        });
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center p-8">
                <Loader2 className="animate-spin text-blue-500 w-8 h-8" />
                <p className="ml-2 text-gray-600">Loading food entries...</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <h2 className="text-3xl font-bold text-gray-800 mb-6 text-center">Log Your Food Intake</h2>

            <div className="bg-white p-6 rounded-xl shadow-md">
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label htmlFor="foodItem" className="block text-sm font-medium text-gray-700">Food Item</label>
                        <input
                            type="text"
                            id="foodItem"
                            value={item}
                            onChange={(e) => setItem(e.target.value)}
                            placeholder="e.g., Dal, Roti, Rice"
                            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500"
                            required
                        />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                           <label htmlFor="carbohydrates" className="block text-sm font-medium text-gray-700">Carbs (g)</label>
                           <input type="number" id="carbohydrates" value={carbohydrates} onChange={(e) => setCarbohydrates(e.target.value)} placeholder="e.g., 30" className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2" required />
                        </div>
                        <div>
                           <label htmlFor="calories" className="block text-sm font-medium text-gray-700">Calories (kcal)</label>
                           <input type="number" id="calories" value={calories} onChange={(e) => setCalories(e.target.value)} placeholder="e.g., 250" className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2" />
                        </div>
                        <div>
                           <label htmlFor="sugars" className="block text-sm font-medium text-gray-700">Sugars (g)</label>
                           <input type="number" id="sugars" value={sugars} onChange={(e) => setSugars(e.target.value)} placeholder="e.g., 5" className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2" />
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label htmlFor="foodDate" className="block text-sm font-medium text-gray-700">Date</label>
                            <input type="date" id="foodDate" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2" required />
                        </div>
                        <div>
                            <label htmlFor="foodTime" className="block text-sm font-medium text-gray-700">Time</label>
                            <input type="time" id="foodTime" value={time} onChange={(e) => setTime(e.target.value)} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2" required />
                        </div>
                    </div>
                    <div>
                        <label htmlFor="foodNotes" className="block text-sm font-medium text-gray-700">Notes (Optional)</label>
                        <textarea id="foodNotes" value={notes} onChange={(e) => setNotes(e.target.value)} rows="3" placeholder="e.g., Lunch, Small portion" className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"></textarea>
                    </div>
                    <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-md shadow-md flex items-center justify-center">
                        {editingId ? <><Edit className="w-5 h-5 mr-2" /> Update Entry</> : <><PlusCircle className="w-5 h-5 mr-2" /> Add Entry</>}
                    </button>
                    {editingId && (
                        <button type="button" onClick={() => { setEditingId(null); setItem(''); setCarbohydrates(''); setCalories(''); setSugars(''); setNotes(''); setDate(new Date().toISOString().slice(0, 10)); setTime(new Date().toTimeString().slice(0, 5)); }} className="w-full bg-gray-400 hover:bg-gray-500 text-white font-bold py-2 px-4 rounded-md shadow-md mt-2">
                            Cancel Edit
                        </button>
                    )}
                </form>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-md">
                <h3 className="text-2xl font-semibold text-gray-800 mb-4">Recent Food Entries</h3>
                {foodEntries.length === 0 ? (
                    <p className="text-gray-500 text-center py-4">No food entries yet.</p>
                ) : (
                    <ul className="divide-y divide-gray-200">
                        {foodEntries.slice(0, 5).map((entry) => (
                            <li key={entry.id} className="py-3 flex justify-between items-center">
                                <div>
                                    <p className="text-lg font-medium text-gray-900">{entry.item}</p>
                                    <p className="text-sm text-gray-600">
                                        {entry.carbohydrates}g Carbs, {entry.calories || 0}kcal, {entry.sugars || 0}g Sugars
                                    </p>
                                    <p className="text-sm text-gray-500">{entry.date} at {entry.time}</p>
                                    {entry.notes && <p className="text-sm text-gray-600 italic">Notes: {entry.notes}</p>}
                                </div>
                                <div className="flex space-x-2">
                                    <button onClick={() => handleEdit(entry)} className="p-2 rounded-full bg-blue-100 text-blue-600 hover:bg-blue-200" title="Edit"><Edit className="w-5 h-5" /></button>
                                    <button onClick={() => handleDelete(entry.id)} className="p-2 rounded-full bg-red-100 text-red-600 hover:bg-red-200" title="Delete"><Trash2 className="w-5 h-5" /></button>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
};

// Exercise Tracker Component
const ExerciseTracker = ({ showCustomModal }) => {
    const { db, userId, isAuthenticated } = useContext(AppContext);
    const [type, setType] = useState('');
    const [duration, setDuration] = useState('');
    const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
    const [time, setTime] = useState(new Date().toTimeString().slice(0, 5));
    const [notes, setNotes] = useState('');
    const [exerciseEntries, setExerciseEntries] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editingId, setEditingId] = useState(null);

    useEffect(() => {
        if (!db || !userId || !isAuthenticated) {
            setLoading(false);
            return;
        }

        setLoading(true);
        const userExercisePath = `users/${userId}/exerciseEntries`;

        const q = query(collection(db, userExercisePath), orderBy('timestamp', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetchedEntries = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setExerciseEntries(fetchedEntries);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching exercise entries:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [db, userId, isAuthenticated]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!type || !duration || !date || !time) {
            showCustomModal("Please fill in all required fields.");
            return;
        }
        if (isNaN(parseFloat(duration)) || parseFloat(duration) <= 0) {
            showCustomModal("Duration must be a positive number.");
            return;
        }

        const entryData = {
            type,
            duration: parseFloat(duration),
            date,
            time,
            notes,
            timestamp: new Date().toISOString()
        };

        try {
            const userExercisePath = `users/${userId}/exerciseEntries`;

            if (editingId) {
                await updateDoc(doc(db, userExercisePath, editingId), entryData);
                showCustomModal("Exercise entry updated successfully!");
                setEditingId(null);
            } else {
                await addDoc(collection(db, userExercisePath), entryData);
                showCustomModal("Exercise entry added successfully!");
            }
            setType('');
            setDuration('');
            setNotes('');
            setDate(new Date().toISOString().slice(0, 10));
            setTime(new Date().toTimeString().slice(0, 5));
        } catch (error) {
            console.error("Error adding/updating exercise entry:", error);
            showCustomModal("Failed to save exercise entry. Please try again.");
        }
    };

    const handleEdit = (entry) => {
        setEditingId(entry.id);
        setType(entry.type);
        setDuration(entry.duration);
        setDate(entry.date);
        setTime(entry.time);
        setNotes(entry.notes || '');
    };

    const handleDelete = (id) => {
        showCustomModal("Are you sure you want to delete this exercise entry?", async () => {
            try {
                const userExercisePath = `users/${userId}/exerciseEntries`;
                await deleteDoc(doc(db, userExercisePath, id));
                showCustomModal("Exercise entry deleted successfully!");
            } catch (error) {
                console.error("Error deleting exercise entry:", error);
                showCustomModal("Failed to delete exercise entry. Please try again.");
            }
        });
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center p-8">
                <Loader2 className="animate-spin text-blue-500 w-8 h-8" />
                <p className="ml-2 text-gray-600">Loading exercise entries...</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <h2 className="text-3xl font-bold text-gray-800 mb-6 text-center">Log Your Exercise</h2>

            {/* Input Form */}
            <div className="bg-white p-6 rounded-xl shadow-md">
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label htmlFor="exerciseType" className="block text-sm font-medium text-gray-700">Exercise Type</label>
                        <input
                            type="text"
                            id="exerciseType"
                            value={type}
                            onChange={(e) => setType(e.target.value)}
                            placeholder="e.g., Walking, Yoga, Cycling"
                            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500"
                            required
                        />
                    </div>
                    <div>
                        <label htmlFor="duration" className="block text-sm font-medium text-gray-700">Duration (minutes)</label>
                        <input
                            type="number"
                            id="duration"
                            value={duration}
                            onChange={(e) => setDuration(e.target.value)}
                            placeholder="e.g., 30"
                            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500"
                            required
                        />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label htmlFor="exerciseDate" className="block text-sm font-medium text-gray-700">Date</label>
                            <input
                                type="date"
                                id="exerciseDate"
                                value={date}
                                onChange={(e) => setDate(e.target.value)}
                                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500"
                                required
                            />
                        </div>
                        <div>
                            <label htmlFor="exerciseTime" className="block text-sm font-medium text-gray-700">Time</label>
                            <input
                                type="time"
                                id="exerciseTime"
                                value={time}
                                onChange={(e) => setTime(e.target.value)}
                                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500"
                                required
                            />
                        </div>
                    </div>
                    <div>
                        <label htmlFor="exerciseNotes" className="block text-sm font-medium text-gray-700">Notes (Optional)</label>
                        <textarea
                            id="exerciseNotes"
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            rows="3"
                            placeholder="e.g., Morning walk, High intensity, Felt good"
                            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500"
                        ></textarea>
                    </div>
                    <button
                        type="submit"
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-md shadow-md transition duration-300 flex items-center justify-center"
                    >
                        {editingId ? <><Edit className="w-5 h-5 mr-2" /> Update Entry</> : <><PlusCircle className="w-5 h-5 mr-2" /> Add Entry</>}
                    </button>
                    {editingId && (
                        <button
                            type="button"
                            onClick={() => { setEditingId(null); setType(''); setDuration(''); setNotes(''); setDate(new Date().toISOString().slice(0, 10)); setTime(new Date().toTimeString().slice(0, 5)); }}
                            className="w-full bg-gray-400 hover:bg-gray-500 text-white font-bold py-2 px-4 rounded-md shadow-md transition duration-300 mt-2"
                        >
                            Cancel Edit
                        </button>
                    )}
                </form>
            </div>

            {/* Recent Exercise Entries List */}
            <div className="bg-white p-6 rounded-xl shadow-md">
                <h3 className="text-2xl font-semibold text-gray-800 mb-4">Recent Exercise Entries</h3>
                {exerciseEntries.length === 0 ? (
                    <p className="text-gray-500 text-center py-4">No exercise entries yet. Add one above!</p>
                ) : (
                    <ul className="divide-y divide-gray-200">
                        {exerciseEntries.slice(0, 5).map((entry) => (
                            <li key={entry.id} className="py-3 flex justify-between items-center">
                                <div>
                                    <p className="text-lg font-medium text-gray-900">{entry.type} ({entry.duration} min)</p>
                                    <p className="text-sm text-gray-500">{entry.date} at {entry.time}</p>
                                    {entry.notes && <p className="text-sm text-gray-600 italic">Notes: {entry.notes}</p>}
                                </div>
                                <div className="flex space-x-2">
                                    <button
                                        onClick={() => handleEdit(entry)}
                                        className="p-2 rounded-full bg-blue-100 text-blue-600 hover:bg-blue-200 transition-colors"
                                        title="Edit"
                                    >
                                        <Edit className="w-5 h-5" />
                                    </button>
                                    <button
                                        onClick={() => handleDelete(entry.id)}
                                        className="p-2 rounded-full bg-red-100 text-red-600 hover:bg-red-200 transition-colors"
                                        title="Delete"
                                    >
                                        <Trash2 className="w-5 h-5" />
                                    </button>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
};

// History Page Component
const HistoryPage = ({ showCustomModal }) => {
    const { db, userId, isAuthenticated } = useContext(AppContext);
    const [allEntries, setAllEntries] = useState([]);
    const [loading, setLoading] = useState(true);
    const [expandedChart, setExpandedChart] = useState(null);

    useEffect(() => {
        if (!db || !userId || !isAuthenticated) {
            setLoading(false);
            return;
        }

        setLoading(true);
        const glucosePath = `users/${userId}/glucoseReadings`;
        const foodPath = `users/${userId}/foodEntries`;
        const exercisePath = `users/${userId}/exerciseEntries`;

        let glucoseReadings = [];
        let foodEntries = [];
        let exerciseEntries = [];

        const updateAllEntries = () => {
            const combined = [...glucoseReadings, ...foodEntries, ...exerciseEntries];
            combined.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            setAllEntries(combined);
            setLoading(false);
        };

        const unsubGlucose = onSnapshot(query(collection(db, glucosePath), orderBy('timestamp', 'desc')), (snapshot) => {
            glucoseReadings = snapshot.docs.map(doc => ({ id: doc.id, type: 'glucose', ...doc.data() }));
            updateAllEntries();
        });

        const unsubFood = onSnapshot(query(collection(db, foodPath), orderBy('timestamp', 'desc')), (snapshot) => {
            foodEntries = snapshot.docs.map(doc => ({ id: doc.id, type: 'food', ...doc.data() }));
            updateAllEntries();
        });

        const unsubExercise = onSnapshot(query(collection(db, exercisePath), orderBy('timestamp', 'desc')), (snapshot) => {
            exerciseEntries = snapshot.docs.map(doc => ({ id: doc.id, type: 'exercise', ...doc.data() }));
            updateAllEntries();
        });

        return () => {
            unsubGlucose();
            unsubFood();
            unsubExercise();
        };
    }, [db, userId, isAuthenticated]);

    const handleDelete = async (entry) => {
        showCustomModal(`Are you sure you want to delete this ${entry.type} entry?`, async () => {
            try {
                let collectionPath;
                switch (entry.type) {
                    case 'glucose':
                        collectionPath = `users/${userId}/glucoseReadings`;
                        break;
                    case 'food':
                        collectionPath = `users/${userId}/foodEntries`;
                        break;
                    case 'exercise':
                        collectionPath = `users/${userId}/exerciseEntries`;
                        break;
                    default:
                        return;
                }
                await deleteDoc(doc(db, collectionPath, entry.id));
                showCustomModal(`${entry.type} entry deleted successfully!`);
            } catch (error) {
                console.error(`Error deleting ${entry.type} entry:`, error);
                showCustomModal(`Failed to delete ${entry.type} entry. Please try again.`);
            }
        });
    };

    const glucoseDataForChart = (() => {
        const dailyAverages = {};
        allEntries.filter(entry => entry.type === 'glucose').forEach(reading => {
            const date = reading.date;
            if (!dailyAverages[date]) dailyAverages[date] = { sum: 0, count: 0 };
            dailyAverages[date].sum += parseFloat(reading.value);
            dailyAverages[date].count++;
        });
        const chartData = Object.keys(dailyAverages).map(date => ({
            date: date.slice(5),
            value: (dailyAverages[date].sum / dailyAverages[date].count).toFixed(2)
        }));
        chartData.sort((a, b) => new Date(`2000-${a.date}`) - new Date(`2000-${b.date}`));
        return chartData;
    })();

    const foodDataForChart = (key) => {
        const dailyTotals = {};
        allEntries.filter(entry => entry.type === 'food').forEach(food => {
            const date = food.date;
            if (!dailyTotals[date]) dailyTotals[date] = 0;
            dailyTotals[date] += parseFloat(food[key] || 0);
        });
        const chartData = Object.keys(dailyTotals).map(date => ({
            date: date.slice(5),
            [key]: dailyTotals[date].toFixed(1)
        }));
        chartData.sort((a, b) => new Date(`2000-${a.date}`) - new Date(`2000-${b.date}`));
        return chartData;
    };

    const exerciseDataForChart = (() => {
        const dailyDuration = {};
        allEntries.filter(entry => entry.type === 'exercise').forEach(exercise => {
            const date = exercise.date;
            if (!dailyDuration[date]) dailyDuration[date] = 0;
            dailyDuration[date] += parseFloat(exercise.duration || 0);
        });
        const chartData = Object.keys(dailyDuration).map(date => ({
            date: date.slice(5),
            duration: dailyDuration[date].toFixed(0)
        }));
        chartData.sort((a, b) => new Date(`2000-${a.date}`) - new Date(`2000-${b.date}`));
        return chartData;
    })();

    if (loading) {
        return (
            <div className="flex items-center justify-center p-8">
                <Loader2 className="animate-spin text-blue-500 w-8 h-8" />
                <p className="ml-2 text-gray-600">Loading history...</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <h2 className="text-3xl font-bold text-gray-800 mb-6 text-center">Your Activity History</h2>

            {/* Collapsible Charts */}
            <div className="bg-white p-6 rounded-xl shadow-md">
                <button onClick={() => setExpandedChart(e => e === 'glucose' ? null : 'glucose')} className="w-full flex justify-between items-center py-2 text-lg font-medium">Glucose History <ChevronDown className={`transition-transform ${expandedChart === 'glucose' ? 'rotate-180' : ''}`} /></button>
                {expandedChart === 'glucose' && (glucoseDataForChart.length > 0 ? <ResponsiveContainer width="100%" height={300}><LineChart data={glucoseDataForChart}><CartesianGrid /><XAxis dataKey="date" /><YAxis /><Tooltip /><Legend /><Line type="monotone" dataKey="value" stroke="#3b82f6" name="Avg. Glucose" /></LineChart></ResponsiveContainer> : <p className="text-center py-4 text-gray-500">No data</p>)}
            </div>

            <div className="bg-white p-6 rounded-xl shadow-md">
                <button onClick={() => setExpandedChart(e => e === 'carbs' ? null : 'carbs')} className="w-full flex justify-between items-center py-2 text-lg font-medium">Carbohydrate History <ChevronDown className={`transition-transform ${expandedChart === 'carbs' ? 'rotate-180' : ''}`} /></button>
                {expandedChart === 'carbs' && (foodDataForChart('carbohydrates').length > 0 ? <ResponsiveContainer width="100%" height={300}><BarChart data={foodDataForChart('carbohydrates')}><CartesianGrid /><XAxis dataKey="date" /><YAxis /><Tooltip /><Legend /><Bar dataKey="carbohydrates" fill="#f97316" name="Total Carbs (g)" /></BarChart></ResponsiveContainer> : <p className="text-center py-4 text-gray-500">No data</p>)}
            </div>
            
            <div className="bg-white p-6 rounded-xl shadow-md">
                <button onClick={() => setExpandedChart(e => e === 'calories' ? null : 'calories')} className="w-full flex justify-between items-center py-2 text-lg font-medium">Calorie History <ChevronDown className={`transition-transform ${expandedChart === 'calories' ? 'rotate-180' : ''}`} /></button>
                {expandedChart === 'calories' && (foodDataForChart('calories').length > 0 ? <ResponsiveContainer width="100%" height={300}><BarChart data={foodDataForChart('calories')}><CartesianGrid /><XAxis dataKey="date" /><YAxis /><Tooltip /><Legend /><Bar dataKey="calories" fill="#ef4444" name="Total Calories (kcal)" /></BarChart></ResponsiveContainer> : <p className="text-center py-4 text-gray-500">No data</p>)}
            </div>

            <div className="bg-white p-6 rounded-xl shadow-md">
                <button onClick={() => setExpandedChart(e => e === 'exercise' ? null : 'exercise')} className="w-full flex justify-between items-center py-2 text-lg font-medium">Exercise History <ChevronDown className={`transition-transform ${expandedChart === 'exercise' ? 'rotate-180' : ''}`} /></button>
                {expandedChart === 'exercise' && (exerciseDataForChart.length > 0 ? <ResponsiveContainer width="100%" height={300}><LineChart data={exerciseDataForChart}><CartesianGrid /><XAxis dataKey="date" /><YAxis /><Tooltip /><Legend /><Line type="monotone" dataKey="duration" stroke="#8b5cf6" name="Duration (min)" /></LineChart></ResponsiveContainer> : <p className="text-center py-4 text-gray-500">No data</p>)}
            </div>

            <div className="bg-white p-6 rounded-xl shadow-md">
                <h3 className="text-2xl font-semibold text-gray-800 mb-4">All Entries</h3>
                {allEntries.length === 0 ? (
                    <p className="text-gray-500 text-center py-4">No history to display.</p>
                ) : (
                    <ul className="divide-y divide-gray-200">
                        {allEntries.map((entry) => (
                            <li key={entry.id} className="py-4 flex justify-between items-center">
                                <div className="flex items-start space-x-3">
                                    {entry.type === 'glucose' && <Droplet className="w-6 h-6 text-blue-500 mt-1" />}
                                    {entry.type === 'food' && <Utensils className="w-6 h-6 text-orange-500 mt-1" />}
                                    {entry.type === 'exercise' && <Activity className="w-6 h-6 text-purple-500 mt-1" />}
                                    <div>
                                        {entry.type === 'glucose' && <p>Glucose: <strong>{entry.value} mg/dL</strong></p>}
                                        {entry.type === 'food' && <p>Food: <strong>{entry.item}</strong> ({entry.carbohydrates}g Carbs, {entry.calories || 0}kcal)</p>}
                                        {entry.type === 'exercise' && <p>Exercise: <strong>{entry.type}</strong> ({entry.duration} min)</p>}
                                        <p className="text-sm text-gray-500">{new Date(entry.timestamp).toLocaleString()}</p>
                                        {entry.notes && <p className="text-sm italic">Notes: {entry.notes}</p>}
                                    </div>
                                </div>
                                <button onClick={() => handleDelete(entry)} className="p-2 text-red-500 hover:bg-red-100 rounded-full"><Trash2 className="w-5 h-5" /></button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
};

// New Image Analysis Component
const ImageAnalysis = ({ showCustomModal }) => {
    const { db, userId, isAuthenticated } = useContext(AppContext);
    const [selectedImage, setSelectedImage] = useState(null);
    const [imagePreview, setImagePreview] = useState(null);
    const [analysisResult, setAnalysisResult] = useState(null);
    const [loadingAnalysis, setLoadingAnalysis] = useState(false);
    const [error, setError] = useState(null);

    const [displayedOverallSummary, setDisplayedOverallSummary] = useState('');
    const [displayedRecommendations, setDisplayedRecommendations] = useState({});
    const TYPING_SPEED_MS = 20;

    const handleImageChange = (event) => {
        const file = event.target.files[0];
        if (file) {
            setSelectedImage(file);
            setImagePreview(URL.createObjectURL(file));
            setAnalysisResult(null);
            setDisplayedOverallSummary('');
            setDisplayedRecommendations({});
            setError(null);
        }
    };

    useEffect(() => {
        if (!analysisResult) return;
        
        const animate = () => {
            if (analysisResult.foodItems && analysisResult.foodItems.length > 0) {
                let itemIndex = 0;
                const typeRec = () => {
                    if (itemIndex < analysisResult.foodItems.length) {
                        const item = analysisResult.foodItems[itemIndex];
                        let charIndex = 0;
                        const interval = setInterval(() => {
                            setDisplayedRecommendations(prev => ({ ...prev, [item.id]: item.recommendation.substring(0, charIndex + 1) }));
                            charIndex++;
                            if (charIndex === item.recommendation.length) {
                                clearInterval(interval);
                                itemIndex++;
                                typeRec();
                            }
                        }, TYPING_SPEED_MS);
                    } else {
                        let summaryIndex = 0;
                        const summaryInterval = setInterval(() => {
                            setDisplayedOverallSummary(analysisResult.overallSummaryForDiabetics.substring(0, summaryIndex + 1));
                            summaryIndex++;
                            if (summaryIndex === analysisResult.overallSummaryForDiabetics.length) {
                                clearInterval(summaryInterval);
                            }
                        }, TYPING_SPEED_MS);
                    }
                };
                typeRec();
            } else if (analysisResult.overallSummaryForDiabetics) {
                 let summaryIndex = 0;
                 const summaryInterval = setInterval(() => {
                     setDisplayedOverallSummary(analysisResult.overallSummaryForDiabetics.substring(0, summaryIndex + 1));
                     summaryIndex++;
                     if (summaryIndex === analysisResult.overallSummaryForDiabetics.length) {
                         clearInterval(summaryInterval);
                     }
                 }, TYPING_SPEED_MS);
            }
        };

        animate();

    }, [analysisResult]);


    const analyzeImage = async () => {
        if (!selectedImage) {
            showCustomModal("Please select an image first.");
            return;
        }

        setLoadingAnalysis(true);
        setAnalysisResult(null);
        setDisplayedOverallSummary('');
        setDisplayedRecommendations({});
        setError(null);

        const reader = new FileReader();
        reader.readAsDataURL(selectedImage);
        reader.onloadend = async () => {
            const base64ImageData = reader.result.split(',')[1];
            const prompt = `Analyze the food item(s) in this image for a diabetic patient. Identify main food items and other recognizable elements. For each food item, provide its common name, Indian name (if applicable), estimated carbohydrates (g), sugars (g), and calories (kcal). Also, assess its suitability for a diabetic (e.g., "Good choice", "Moderate, with portion control", "Avoid or limit") and provide a specific recommendation (e.g., portion size, alternatives). Respond with a JSON object containing "foodItems" (array of objects), "otherItems" (array of strings), and an "overallSummaryForDiabetics" (string).`;
            
            const payload = {
                contents: [{ role: "user", parts: [{ text: prompt }, { inlineData: { mimeType: selectedImage.type, data: base64ImageData } }] }],
                generationConfig: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: "OBJECT",
                        properties: {
                            "foodItems": { "type": "ARRAY", "items": { "type": "OBJECT", "properties": { "foodItem": { "type": "STRING" }, "indianName": { "type": "STRING" }, "carbohydrates_g": { "type": "NUMBER" }, "sugars_g": { "type": "NUMBER" }, "calories_kcal": { "type": "NUMBER" }, "diabeticSuitability": { "type": "STRING" }, "recommendation": { "type": "STRING" } } } },
                            "otherItems": { "type": "ARRAY", "items": { "type": "STRING" } },
                            "overallSummaryForDiabetics": { "type": "STRING" }
                        }
                    }
                }
            };

            const apiKey = "";
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;

            try {
                const response = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
                if (!response.ok) throw new Error(`API error: ${response.status} ${await response.text()}`);
                
                const result = await response.json();
                const jsonString = result.candidates?.[0]?.content?.parts?.[0]?.text;
                if (!jsonString) throw new Error("Empty response from AI.");

                const parsedJson = JSON.parse(jsonString);
                const foodItemsWithIds = parsedJson.foodItems ? parsedJson.foodItems.map(item => ({ ...item, id: Math.random().toString(36).substr(2, 9) })) : [];
                const finalResult = { ...parsedJson, foodItems: foodItemsWithIds };
                
                setAnalysisResult(finalResult);

                if (db && userId) {
                    await addDoc(collection(db, `users/${userId}/imageAnalysisHistory`), {
                        timestamp: new Date().toISOString(),
                        title: finalResult.foodItems?.[0]?.foodItem || "Food Analysis",
                        ...finalResult
                    });
                }
            } catch (err) {
                console.error("Error during image analysis:", err);
                setError(`An error occurred: ${err.message}`);
            } finally {
                setLoadingAnalysis(false);
            }
        };
    };

    return (
        <div className="space-y-6">
            <h2 className="text-3xl font-bold text-gray-800 mb-6 text-center">Analyze Food Image</h2>

            <div className="bg-white p-6 rounded-xl shadow-md">
                <div className="flex flex-col items-center space-y-4">
                    <label htmlFor="imageUpload" className="cursor-pointer bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 px-6 rounded-md shadow-md flex items-center justify-center">
                        <Camera className="w-5 h-5 mr-2" /> Upload Image
                        <input type="file" id="imageUpload" accept="image/*" onChange={handleImageChange} className="hidden" />
                    </label>
                    
                    {imagePreview && <div className="mt-4 w-full max-w-sm border rounded-lg overflow-hidden"><img src={imagePreview} alt="Preview" className="w-full h-auto" /></div>}
                    
                    <button onClick={analyzeImage} disabled={!selectedImage || loadingAnalysis} className="w-full max-w-sm py-3 px-6 rounded-md shadow-md flex items-center justify-center bg-green-600 hover:bg-green-700 text-white font-bold disabled:bg-gray-400 disabled:cursor-not-allowed">
                        {loadingAnalysis ? <Loader2 className="animate-spin w-5 h-5 mr-2" /> : null}
                        {loadingAnalysis ? 'Analyzing...' : 'Analyze Image'}
                    </button>
                </div>
            </div>

            {error && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-md"><strong>Error:</strong> {error}</div>}

            {analysisResult && (
                <div className="bg-white p-6 rounded-xl shadow-md space-y-4">
                    <h3 className="text-2xl font-semibold text-gray-800">Analysis Result</h3>
                    {analysisResult.foodItems?.length > 0 && (
                        <>
                            <h4 className="text-lg font-semibold">Identified Food Items:</h4>
                            <ul className="space-y-3">
                                {analysisResult.foodItems.map(item => (
                                    <li key={item.id} className="bg-blue-50 p-3 rounded-lg border border-blue-100">
                                        <p className="font-bold text-blue-800">{item.foodItem} {item.indianName && `(${item.indianName})`}</p>
                                        <ul className="list-disc list-inside text-sm ml-4 mt-1">
                                            <li>Carbs: <strong>{item.carbohydrates_g}g</strong>, Sugars: <strong>{item.sugars_g}g</strong>, Calories: <strong>{item.calories_kcal} kcal</strong></li>
                                            <li>Suitability: <strong>{item.diabeticSuitability}</strong></li>
                                            <li>Recommendation: <span className="italic">{displayedRecommendations[item.id] || ''}</span></li>
                                        </ul>
                                    </li>
                                ))}
                            </ul>
                        </>
                    )}
                    {analysisResult.otherItems?.length > 0 && <p><strong>Other Items:</strong> {analysisResult.otherItems.join(', ')}</p>}
                    {displayedOverallSummary && <p><strong>Overall Summary:</strong> {displayedOverallSummary}</p>}
                </div>
            )}
        </div>
    );
};

// New Image Analysis History Component
const ImageAnalysisHistory = ({ showCustomModal }) => {
    const { db, userId, isAuthenticated } = useContext(AppContext);
    const [analysisHistory, setAnalysisHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [expandedCard, setExpandedCard] = useState(null);

    useEffect(() => {
        if (!db || !userId || !isAuthenticated) {
            setLoading(false);
            return;
        }
        setLoading(true);
        const q = query(collection(db, `users/${userId}/imageAnalysisHistory`), orderBy('timestamp', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setAnalysisHistory(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            setLoading(false);
        }, (error) => {
            console.error("Error fetching image analysis history:", error);
            setLoading(false);
        });
        return () => unsubscribe();
    }, [db, userId, isAuthenticated]);

    const handleDelete = (id) => {
        showCustomModal("Are you sure you want to delete this analysis?", async () => {
            try {
                await deleteDoc(doc(db, `users/${userId}/imageAnalysisHistory`, id));
                showCustomModal("Analysis deleted successfully!");
            } catch (error) {
                console.error("Error deleting analysis:", error);
                showCustomModal("Failed to delete analysis.");
            }
        });
    };

    if (loading) {
        return <div className="flex justify-center p-8"><Loader2 className="animate-spin w-8 h-8 text-blue-500" /></div>;
    }

    return (
        <div className="space-y-6">
            <h2 className="text-3xl font-bold text-gray-800 mb-6 text-center">Image Analysis History</h2>
            {analysisHistory.length === 0 ? (
                <div className="text-center py-8 bg-white rounded-xl shadow-md">
                    <Camera className="w-16 h-16 mx-auto text-gray-400 mb-4" />
                    <p className="text-lg text-gray-600">No image analyses yet.</p>
                </div>
            ) : (
                analysisHistory.map((entry) => (
                    <div key={entry.id} className="bg-white p-6 rounded-xl shadow-md">
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <h3 className="text-2xl font-bold text-blue-800">{entry.title || "Food Analysis"}</h3>
                                <p className="text-sm text-gray-500">{new Date(entry.timestamp).toLocaleString()}</p>
                            </div>
                            <button onClick={() => handleDelete(entry.id)} className="p-2 text-red-500 hover:bg-red-100 rounded-full"><Trash2 className="w-5 h-5" /></button>
                        </div>
                        <p className="italic text-gray-700">"{entry.overallSummaryForDiabetics || 'No summary available.'}"</p>
                        <button onClick={() => setExpandedCard(e => e === entry.id ? null : entry.id)} className="w-full mt-4 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-md">
                            {expandedCard === entry.id ? 'Hide Details' : 'Show Details'} <ChevronDown className={`inline-block transition-transform ${expandedCard === entry.id ? 'rotate-180' : ''}`} />
                        </button>
                        {expandedCard === entry.id && (
                            <div className="mt-4 pt-4 border-t space-y-3">
                                {entry.foodItems?.map((item, index) => (
                                    <div key={index} className="bg-gray-50 p-3 rounded-lg">
                                        <p className="font-bold">{item.foodItem}</p>
                                        <p className="text-sm">Carbs: {item.carbohydrates_g}g, Sugars: {item.sugars_g}g, Calories: {item.calories_kcal}kcal</p>
                                        <p className="text-sm italic">{item.recommendation}</p>
                                    </div>
                                ))}
                                {entry.otherItems?.length > 0 && <p className="text-sm">Also seen: {entry.otherItems.join(', ')}</p>}
                            </div>
                        )}
                    </div>
                ))
            )}
        </div>
    );
};

export default App;
