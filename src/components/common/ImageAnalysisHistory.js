import React, { useState, useEffect, useContext } from 'react';
import { collection, query, orderBy, onSnapshot, doc, deleteDoc } from 'firebase/firestore';
import AppContext from '../../contexts/AppContext';// Assuming AppContext is in a contexts folder
import { Loader2, Camera, Trash2, ChevronDown } from 'lucide-react';

// Image Analysis History Component: Displays a list of past food image analyses.
const ImageAnalysisHistory = ({ showCustomModal }) => {
    // Access Firebase services and user info from the global context.
    const { db, userId, isAuthenticated } = useContext(AppContext);

    // State for managing data and UI
    const [analysisHistory, setAnalysisHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [expandedCard, setExpandedCard] = useState(null); // Tracks which card's details are visible

    // useEffect to fetch the analysis history from Firestore in real-time.
    useEffect(() => {
        // Guard clause: Do not run if Firebase isn't ready or user is not logged in.
        if (!db || !userId || !isAuthenticated) {
            setLoading(false);
            return;
        }

        setLoading(true);
        // Create a Firestore query to get history, ordered by the most recent timestamp.
        const q = query(collection(db, `users/${userId}/imageAnalysisHistory`), orderBy('timestamp', 'desc'));

        // onSnapshot sets up a real-time listener for data changes.
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const history = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setAnalysisHistory(history);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching image analysis history:", error);
            showCustomModal("Could not fetch analysis history. Please try again.");
            setLoading(false);
        });

        // Cleanup function to detach the listener when the component unmounts.
        return () => unsubscribe();
    }, [db, userId, isAuthenticated, showCustomModal]); // Effect dependencies

    // Deletes a history entry after user confirmation.
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

    // Toggles the visibility of a card's detailed view.
    const toggleCardExpansion = (id) => {
        setExpandedCard(prevId => (prevId === id ? null : id));
    };

    // Conditional rendering while data is loading.
    if (loading) {
        return (
            <div className="flex items-center justify-center p-8">
                <Loader2 className="animate-spin text-blue-500 w-8 h-8" />
                <p className="ml-2 text-gray-600">Loading analysis history...</p>
            </div>
        );
    }

    // Main component JSX
    return (
        <div className="space-y-6">
            <h2 className="text-3xl font-bold text-gray-800 mb-6 text-center">Image Analysis History</h2>
            {analysisHistory.length === 0 ? (
                <div className="text-center py-8 bg-white rounded-xl shadow-md">
                    <Camera className="w-16 h-16 mx-auto text-gray-400 mb-4" />
                    <p className="text-lg text-gray-600">No image analyses yet.</p>
                    <p className="text-sm text-gray-500 mt-1">Use the "Analyze Food" tab to get started.</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {analysisHistory.map((entry) => (
                        <div key={entry.id} className="bg-white p-6 rounded-xl shadow-md">
                            <div className="flex justify-between items-start mb-4">
                                <div>
                                    <h3 className="text-2xl font-bold text-blue-800">{entry.title || "Food Analysis"}</h3>
                                    <p className="text-sm text-gray-500">{new Date(entry.timestamp).toLocaleString()}</p>
                                </div>
                                <button onClick={() => handleDelete(entry.id)} className="p-2 text-red-500 hover:bg-red-100 rounded-full" title="Delete Analysis">
                                    <Trash2 className="w-5 h-5" />
                                </button>
                            </div>
                            <p className="italic text-gray-700">"{entry.overallSummaryForDiabetics || 'No summary available.'}"</p>
                            
                            <button onClick={() => toggleCardExpansion(entry.id)} className="w-full text-left mt-4 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-md flex justify-between items-center">
                                <span>{expandedCard === entry.id ? 'Hide Details' : 'Show Details'}</span>
                                <ChevronDown className={`inline-block transition-transform ${expandedCard === entry.id ? 'rotate-180' : ''}`} />
                            </button>

                            {expandedCard === entry.id && (
                                <div className="mt-4 pt-4 border-t border-gray-200 space-y-3 animate-fade-in">
                                    {entry.foodItems?.map((item, index) => (
                                        <div key={index} className="bg-gray-50 p-3 rounded-lg">
                                            <p className="font-bold text-gray-800">{item.foodItem}</p>
                                            <p className="text-sm text-gray-600">Carbs: {item.carbohydrates_g}g, Sugars: {item.sugars_g}g, Calories: {item.calories_kcal}kcal</p>
                                            <p className="text-sm text-gray-600 italic mt-1">{item.recommendation}</p>
                                        </div>
                                    ))}
                                    {entry.otherItems?.length > 0 && <p className="text-sm text-gray-600"><strong>Also seen:</strong> {entry.otherItems.join(', ')}</p>}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default ImageAnalysisHistory;
