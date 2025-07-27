const express = require('express')
const admin = require('firebase-admin')
const cors = require('cors')
const { body, validationResult } = require('express-validator')

const serviceAccount = require('./serviceAccountKey.json')

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
})

const db = admin.firestore()
const app = express()
const port = 3000

app.use(cors())
app.use(express.json())

// Validate incoming request data using express-validator
const validateData = [
    body('Bin_Id').isString().withMessage('Bin_Id should be a string'),
    body('Distance').isFloat().withMessage('Distance should be a valid float'),
    body('Token').isString().withMessage('Token should be a string'),
]

app.post('/api/bin', validateData, async (req, res) => {
    // Check for validation errors
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() })
    }

    const { Bin_Id, Distance, Token } = req.body
    console.log(req.body)

    try {
        const binDoc = await db.collection('bins').doc(Bin_Id).get()

        if (!binDoc.exists) {
            return res.status(404).json({ message: 'Bin not registered.' })
        }

        const binData = binDoc.data()

        // Validate token
        if (binData.Token !== Token) {
            return res.status(403).json({ message: 'Invalid token. Unauthorized.' })
        }

        // Calculate fill level percentage
        const fillLevelPercentage = calculateFillLevel(binData.Height, Distance)

        // Save fill level to Firestore with additional information
        await db.collection('fill_levels').add({
            Bin_Id,
            Fill_Level_Percentage: fillLevelPercentage,
            Timestamp: admin.firestore.FieldValue.serverTimestamp(), // Use Firestore's timestamp
        })

        // Update the bin's fill level with the calculated percentage
        await db.collection('bins').doc(Bin_Id).update({
            Fill_Level_Percentage: fillLevelPercentage, // Update the Fill_Level field in the bins collection
        })

        res.status(200).json({
            message: 'Distance and fill level saved.',
            binId: binData.Bin_Id,
            fillLevelPercentage,
        })
    } catch (err) {
        console.error('Error verifying token or saving data:', err)
        res.status(500).json({ message: 'Internal server error' })
    }
})

// Function to calculate fill level as a percentage
function calculateFillLevel(binHeight, distance) {
    if (binHeight <= 0 || distance < 0) {
        throw new Error('Invalid height or distance values')
    }

    // Calculate the fill level percentage
    const fillLevelPercentage = ((binHeight - distance) / binHeight) * 100

    // Ensure the value stays within 0 to 100 range
    return Math.max(0, Math.min(100, fillLevelPercentage))
}

app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`)
})
