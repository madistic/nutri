import React, { useState, useEffect, useContext } from 'react';
import { collection, query, orderBy, onSnapshot, addDoc, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import { AppContext } from '../contexts/AppContext'; // Assuming AppContext is in a contexts folder
import { Loader2, PlusCircle, Edit, Trash2 } from 'lucide-react';

// Food Tracker Component: Handles logging, viewing, editing, and deleting food intake.
const FoodTracker = ({ showCustomModal }) => {
    // Access Firebase services and user info from the global context.
    const { db, userId, isAuthenticated } = useContext(AppContext);

    // State for form inputs
    const [item, setItem] = useState('');
    const [carbohydrates, setCarbohydrates] = useState('');
    const [calories, setCalories] = useState('');
    const [sugars, setSugars] = useState('');
    const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
    const [time, setTime] = useState(new Date().toTimeString().slice(0, 5));
    const [notes, setNotes] = useState('');

    // State for managing data and UI
    const [foodEntries, setFoodEntries] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editingId, setEditingId] = useState(null); // Tracks the ID of the entry being edited

    // useEffect to fetch food entries from Firestore in real-time.
    useEffect(() => {
        // Guard clause: Do not run if Firebase isn't ready or user is not logged in.
        if (!db || !userId || !isAuthenticated) {
            setLoading(false);
            return;
        }

        setLoading(true);
        // Define the path to the user's specific food entries collection.
        const userFoodPath = `users/${userId}/foodEntries`;

        // Create a Firestore query to get entries, ordered by the most recent timestamp.
        const q = query(collection(db, userFoodPath), orderBy('timestamp', 'desc'));

        // onSnapshot sets up a real-time listener for data changes.
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetchedEntries = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setFoodEntries(fetchedEntries);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching food entries:", error);
            showCustomModal("Could not fetch food data. Please try again.");
            setLoading(false);
        });

        // Cleanup function to detach the listener when the component unmounts.
        return () => unsubscribe();
    }, [db, userId, isAuthenticated, showCustomModal]); // Effect dependencies

    // Handles the form submission for adding or updating a food entry.
    const handleSubmit = async (e) => {
        e.preventDefault();

        // Input validation
        if (!item || !carbohydrates || !date || !time) {
            showCustomModal("Please fill in the food item, carbohydrates, date, and time.");
            return;
        }
        if (isNaN(parseFloat(carbohydrates)) || parseFloat(carbohydrates) < 0) {
            showCustomModal("Carbohydrates must be a non-negative number.");
            return;
        }
        if (calories && (isNaN(parseFloat(calories)) || parseFloat(calories) < 0)) {
            showCustomModal("Calories must be a non-negative number.");
            return;
        }
        if (sugars && (isNaN(parseFloat(sugars)) || parseFloat(sugars) < 0)) {
            showCustomModal("Sugars must be a non-negative number.");
            return;
        }

        // Prepare the data object for Firestore.
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
                // Update existing document if in editing mode.
                await updateDoc(doc(db, userFoodPath, editingId), entryData);
                showCustomModal("Food entry updated successfully!");
            } else {
                // Add a new document if not editing.
                await addDoc(collection(db, userFoodPath), entryData);
                showCustomModal("Food entry added successfully!");
            }
            resetForm(); // Reset the form fields.
        } catch (error) {
            console.error("Error adding/updating food entry:", error);
            showCustomModal("Failed to save food entry. Please try again.");
        }
    };
    
    // Resets all form fields to their default state.
    const resetForm = () => {
        setItem('');
        setCarbohydrates('');
        setCalories('');
        setSugars('');
        setNotes('');
        setDate(new Date().toISOString().slice(0, 10));
        setTime(new Date().toTimeString().slice(0, 5));
        setEditingId(null);
    };

    // Populates the form with the data of the entry to be edited.
    const handleEdit = (entry) => {
        setEditingId(entry.id);
        setItem(entry.item);
        setCarbohydrates(entry.carbohydrates);
        setCalories(entry.calories || '');
        setSugars(entry.sugars || '');
        setDate(entry.date);
        setTime(entry.time);
        setNotes(entry.notes || '');
        window.scrollTo(0, 0); // Scroll to top to see the form.
    };

    // Deletes an entry after user confirmation.
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

    // Conditional rendering while data is loading.
    if (loading) {
        return (
            <div className="flex items-center justify-center p-8">
                <Loader2 className="animate-spin text-blue-500 w-8 h-8" />
                <p className="ml-2 text-gray-600">Loading food entries...</p>
            </div>
        );
    }

    // Main component JSX
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
                        <button type="button" onClick={resetForm} className="w-full bg-gray-400 hover:bg-gray-500 text-white font-bold py-2 px-4 rounded-md shadow-md mt-2">
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
                            <li key={entry.id} className="py-3 flex justify-between items-center flex-wrap">
                                <div className="flex-grow">
                                    <p className="text-lg font-medium text-gray-900">{entry.item}</p>
                                    <p className="text-sm text-gray-600">
                                        {entry.carbohydrates}g Carbs, {entry.calories || 0}kcal, {entry.sugars || 0}g Sugars
                                    </p>
                                    <p className="text-sm text-gray-500">{entry.date} at {entry.time}</p>
                                    {entry.notes && <p className="text-sm text-gray-600 italic mt-1">Notes: {entry.notes}</p>}
                                </div>
                                <div className="flex space-x-2 mt-2 sm:mt-0">
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

export default FoodTracker;
