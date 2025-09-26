const { faker } = require('@faker-js/faker');
const fs = require('fs');
const crypto = require('crypto');

// Load environment variables
require('dotenv').config();

// Environment variable validation
const requiredEnvVars = ['NUMBER_OF_PEOPLE', 'CAUCASIAN_PERCENTAGE', 'ASIAN_PERCENTAGE', 'INDIAN_PERCENTAGE'];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingVars.length > 0) {
    console.error(`❌ Missing required environment variables: ${missingVars.join(', ')}`);
    console.error('Please copy .env.template to .env and configure all required variables.');
    process.exit(1);
}

// Configuration - Use environment variables
const NumberOfPeople = parseInt(process.env.NUMBER_OF_PEOPLE);
const CAUCASIAN_PERCENTAGE = parseInt(process.env.CAUCASIAN_PERCENTAGE);
const ASIAN_PERCENTAGE = parseInt(process.env.ASIAN_PERCENTAGE);
const INDIAN_PERCENTAGE = parseInt(process.env.INDIAN_PERCENTAGE);
// Diverse name datasets
const indianFirstNames = {
    male: ['Aarav', 'Arjun', 'Advik', 'Arnav', 'Atharva', 'Ayaan', 'Dev', 'Dhruv', 'Ishaan', 'Kabir', 'Krish', 'Kiran', 'Laksh', 'Naman', 'Om', 'Pranav', 'Raj', 'Rahul', 'Rohan', 'Rudra', 'Sai', 'Sameer', 'Shaan', 'Shivansh', 'Tanish', 'Veer', 'Vihaan', 'Vikram', 'Yash', 'Aditya', 'Akash', 'Amit', 'Ankit', 'Ashish', 'Deepak', 'Gaurav', 'Harsh', 'Jay', 'Karan', 'Kunal', 'Manoj', 'Nikhil', 'Pawan', 'Ravi', 'Sachin', 'Sandeep', 'Sunil', 'Varun', 'Vinay'],
    female: ['Aadhya', 'Aanya', 'Aara', 'Aarvi', 'Aditi', 'Aishwarya', 'Ananya', 'Angel', 'Anvi', 'Arya', 'Diya', 'Kavya', 'Khushi', 'Kiara', 'Myra', 'Navya', 'Pihu', 'Priya', 'Riya', 'Sara', 'Saanvi', 'Shanaya', 'Siya', 'Tanvi', 'Tara', 'Vaani', 'Zara', 'Akshara', 'Alisha', 'Avni', 'Divya', 'Ishita', 'Janvi', 'Jiya', 'Kashish', 'Mira', 'Nisha', 'Pooja', 'Radha', 'Shreya', 'Sneha', 'Sonali', 'Srishti', 'Swati', 'Tanya', 'Vani', 'Varsha', 'Vidya', 'Yamini']
};

const caucasianFirstNames = {
    male: ['James', 'John', 'Robert', 'Michael', 'David', 'William', 'Richard', 'Charles', 'Joseph', 'Thomas', 'Christopher', 'Daniel', 'Paul', 'Mark', 'Donald', 'Steven', 'Kenneth', 'Andrew', 'Joshua', 'Kevin', 'Brian', 'George', 'Timothy', 'Ronald', 'Jason', 'Edward', 'Jeffrey', 'Ryan', 'Jacob', 'Gary', 'Nicholas', 'Eric', 'Jonathan', 'Stephen', 'Larry', 'Justin', 'Scott', 'Brandon', 'Benjamin', 'Samuel', 'Gregory', 'Alexander', 'Patrick', 'Frank', 'Raymond', 'Jack', 'Dennis', 'Jerry', 'Tyler', 'Aaron'],
    female: ['Mary', 'Patricia', 'Jennifer', 'Linda', 'Elizabeth', 'Barbara', 'Susan', 'Jessica', 'Sarah', 'Karen', 'Nancy', 'Lisa', 'Betty', 'Helen', 'Sandra', 'Donna', 'Carol', 'Ruth', 'Sharon', 'Michelle', 'Laura', 'Sarah', 'Kimberly', 'Deborah', 'Dorothy', 'Lisa', 'Nancy', 'Karen', 'Betty', 'Helen', 'Sandra', 'Donna', 'Carol', 'Ruth', 'Sharon', 'Michelle', 'Laura', 'Sarah', 'Kimberly', 'Deborah', 'Dorothy', 'Amy', 'Angela', 'Ashley', 'Brenda', 'Emma', 'Olivia', 'Cynthia', 'Marie', 'Janet', 'Catherine']
};

const asianFirstNames = {
    male: ['Wei', 'Hiroshi', 'Kenji', 'Takeshi', 'Yuki', 'Chen', 'Li', 'Wang', 'Zhang', 'Liu', 'Yang', 'Huang', 'Zhao', 'Wu', 'Zhou', 'Xu', 'Sun', 'Ma', 'Zhu', 'Hu', 'Guo', 'He', 'Lin', 'Luo', 'Han', 'Deng', 'Feng', 'Cao', 'Peng', 'Dai', 'Jin', 'Song', 'Du', 'Cui', 'Liang', 'Shi', 'Lu', 'Kong', 'Tan', 'Xie', 'Min-jun', 'Jun-seo', 'Do-yun', 'Si-woo', 'Ha-jun', 'Yu-jun', 'Seo-jun', 'Ye-jun', 'Ji-ho', 'Eun-woo'],
    female: ['Mei', 'Yuki', 'Akiko', 'Hiroko', 'Keiko', 'Li', 'Wang', 'Zhang', 'Liu', 'Chen', 'Yang', 'Huang', 'Zhao', 'Wu', 'Zhou', 'Xu', 'Sun', 'Ma', 'Zhu', 'Hu', 'Xiao', 'Jing', 'Na', 'Min', 'Qing', 'Hui', 'Hong', 'Yan', 'Fang', 'Juan', 'Ping', 'Ling', 'Xia', 'Rui', 'Dan', 'So-young', 'Min-seo', 'Seo-yeon', 'Ha-yoon', 'Ji-woo', 'Ye-eun', 'Chae-won', 'Su-bin', 'Ga-eun', 'Yu-jin']
};

const indianLastNames = [
    'Agarwal', 'Agrawal', 'Ahuja', 'Bansal', 'Bhatia', 'Chopra', 'Garg', 'Goyal', 'Gupta', 'Jain', 'Jindal', 'Kapoor', 'Kumar', 'Mahajan', 'Malhotra', 'Mehra', 'Mittal', 'Patel', 'Rao', 'Reddy', 'Saha', 'Saxena', 'Sethi', 'Shah', 'Sharma', 'Singh', 'Sinha', 'Tiwari', 'Verma', 'Yadav',
    'Aggarwal', 'Bajaj', 'Bhargava', 'Chandra', 'Dutta', 'Ghosh', 'Iyer', 'Joshi', 'Khurana', 'Lal', 'Menon', 'Nair', 'Pandey', 'Pillai', 'Rastogi', 'Sabharwal', 'Tandon', 'Vyas', 'Wadhwa', 'Zaveri',
    'Arora', 'Bharti', 'Choudhary', 'Das', 'Dixit', 'Goel', 'Khandelwal', 'Mishra', 'Narang', 'Prasad', 'Roy', 'Sahni', 'Tripathi', 'Upadhyay', 'Varma'
];

const caucasianLastNames = [
    'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Perez', 'Thompson', 'White', 'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson', 'Walker', 'Young', 'Allen', 'King', 'Wright', 'Scott', 'Torres', 'Nguyen', 'Hill', 'Flores', 'Green', 'Adams', 'Nelson', 'Baker', 'Hall', 'Rivera', 'Campbell', 'Mitchell', 'Carter', 'Roberts'
];

const asianLastNames = [
    'Li', 'Wang', 'Zhang', 'Liu', 'Chen', 'Yang', 'Huang', 'Zhao', 'Wu', 'Zhou', 'Xu', 'Sun', 'Ma', 'Zhu', 'Hu', 'Guo', 'He', 'Lin', 'Luo', 'Han', 'Deng', 'Feng', 'Cao', 'Peng', 'Dai', 'Jin', 'Song', 'Du', 'Cui', 'Liang', 'Shi', 'Lu', 'Kong', 'Tan', 'Xie', 'Sato', 'Suzuki', 'Takahashi', 'Tanaka', 'Watanabe', 'Ito', 'Yamamoto', 'Nakamura', 'Kobayashi', 'Saito', 'Kato', 'Yoshida', 'Yamada', 'Sasaki', 'Yamaguchi', 'Kim', 'Lee', 'Park', 'Choi', 'Jung', 'Kang', 'Cho', 'Yoon', 'Jang', 'Lim', 'Han', 'Oh', 'Seo', 'Shin', 'Kwon', 'Hwang', 'Ahn', 'Song', 'Hong', 'Chang'
];

const indianMiddleNames = [
    'Kumar', 'Prasad', 'Raj', 'Singh', 'Devi', 'Kumari', 'Lal', 'Chand', 'Mohan', 'Prakash', 'Shankar', 'Narayan', 'Kishore', 'Chandra', 'Bhushan'
];

const caucasianMiddleNames = [
    'James', 'John', 'William', 'David', 'Richard', 'Michael', 'Robert', 'Charles', 'Joseph', 'Thomas', 'Daniel', 'Matthew', 'Anthony', 'Mark', 'Donald', 'Steven', 'Paul', 'Andrew', 'Kenneth', 'Christopher'
];

const asianMiddleNames = [
    'Wei', 'Ming', 'Jun', 'Hao', 'Jian', 'Qing', 'Long', 'Feng', 'Gang', 'Bin', 'Hui', 'Dong', 'Hong', 'Ping', 'Xin', 'Bo', 'Tao', 'Lei', 'Kai', 'Nan'
];

const indianCities = [
    'Mumbai', 'Delhi', 'Bangalore', 'Kolkata', 'Chennai', 'Hyderabad', 'Pune', 'Ahmedabad', 'Surat', 'Jaipur',
    'Lucknow', 'Kanpur', 'Nagpur', 'Visakhapatnam', 'Indore', 'Thane', 'Bhopal', 'Pimpri-Chinchwad', 'Patna', 'Vadodara',
    'Ghaziabad', 'Ludhiana', 'Coimbatore', 'Agra', 'Madurai', 'Nashik', 'Faridabad', 'Meerut', 'Rajkot', 'Kalyan-Dombivali',
    'Vasai-Virar', 'Varanasi', 'Srinagar', 'Aurangabad', 'Dhanbad', 'Amritsar', 'Navi Mumbai', 'Allahabad', 'Ranchi', 'Howrah',
    'Jabalpur', 'Gwalior', 'Vijayawada', 'Jodhpur', 'Raipur', 'Kota', 'Guwahati', 'Chandigarh', 'Solapur', 'Hubli-Dharwad'
];

// Helper function to select ethnicity based on configured percentages
function selectEthnicityByWeights() {
    const random = Math.random() * 100;
    if (random < CAUCASIAN_PERCENTAGE) {
        return 'caucasian';
    } else if (random < CAUCASIAN_PERCENTAGE + ASIAN_PERCENTAGE) {
        return 'asian';
    } else {
        return 'indian';
    }
}

// Generate diverse first name from all ethnicities
function generateDiverseFirstName() {
    const gender = faker.datatype.boolean() ? 'male' : 'female';
    const ethnicity = selectEthnicityByWeights();

    switch (ethnicity) {
        case 'indian':
            return faker.helpers.arrayElement(indianFirstNames[gender]);
        case 'caucasian':
            return faker.helpers.arrayElement(caucasianFirstNames[gender]);
        case 'asian':
            return faker.helpers.arrayElement(asianFirstNames[gender]);
        default:
            return faker.helpers.arrayElement(indianFirstNames[gender]);
    }
}

// Generate diverse last name from all ethnicities
function generateDiverseLastName() {
    const ethnicity = selectEthnicityByWeights();

    switch (ethnicity) {
        case 'indian':
            return faker.helpers.arrayElement(indianLastNames);
        case 'caucasian':
            return faker.helpers.arrayElement(caucasianLastNames);
        case 'asian':
            return faker.helpers.arrayElement(asianLastNames);
        default:
            return faker.helpers.arrayElement(indianLastNames);
    }
}

// Generate diverse middle name from all ethnicities
function generateDiverseMiddleName() {
    const ethnicity = selectEthnicityByWeights();

    switch (ethnicity) {
        case 'indian':
            return faker.helpers.arrayElement(indianMiddleNames);
        case 'caucasian':
            return faker.helpers.arrayElement(caucasianMiddleNames);
        case 'asian':
            return faker.helpers.arrayElement(asianMiddleNames);
        default:
            return faker.helpers.arrayElement(indianMiddleNames);
    }
}

// Legacy functions (kept for backward compatibility)
function generateIndianFirstName() {
    const gender = faker.datatype.boolean() ? 'male' : 'female';
    return faker.helpers.arrayElement(indianFirstNames[gender]);
}

function generateIndianLastName() {
    return faker.helpers.arrayElement(indianLastNames);
}

function generateIndianMiddleName() {
    return faker.helpers.arrayElement(indianMiddleNames);
}

// Generate Indian city name
function generateIndianCity() {
    return faker.helpers.arrayElement(indianCities);
}

// STEP 1: Generate plaintext PII data for Vault encryption pipeline

// PII data types
const PII_TYPES = {
    PAN_CARD: 'PAN_CARD',
    GST_NUMBER: 'GST_NUMBER',
    DOB: 'DOB',
    MOBILE_NUMBER: 'MOBILE_NUMBER',
    PIN_CODE: 'PIN_CODE',
    MASK: 'MASK',
    PASSPORT_NUMBER: 'PASSPORT_NUMBER',
    NAME: 'NAME',
    FIRST_NAME: 'FIRST_NAME',
    LAST_NAME: 'LAST_NAME',
    ADDRESS: 'ADDRESS',
    JSON: 'JSON',
    OTHER: 'OTHER',
    BINARY: 'BINARY',
    EMAIL: 'EMAIL'
};

// Generate PAN Card format: 5 letters, 4 digits, 1 letter
function generatePAN() {
    const letters1 = faker.string.alpha({ length: 5, casing: 'upper' });
    const digits = faker.string.numeric(4);
    const letter2 = faker.string.alpha({ length: 1, casing: 'upper' });
    return `${letters1}${digits}${letter2}`;
}

// Generate GST Number format: 15 digits
function generateGST() {
    return faker.string.numeric(15);
}

// Generate Indian mobile number
function generateMobileNumber() {
    const prefixes = ['9', '8', '7', '6'];
    const prefix = faker.helpers.arrayElement(prefixes);
    const remaining = faker.string.numeric(9);
    return `${prefix}${remaining}`;
}

// Generate Indian PIN code (6 digits)
function generatePinCode() {
    return faker.string.numeric(6);
}

// Generate passport number format
function generatePassport() {
    const letter = faker.string.alpha({ length: 1, casing: 'upper' });
    const digits = faker.string.numeric(7);
    return `${letter}${digits}`;
}

// Generate masked data
function generateMask() {
    const original = faker.internet.email();
    const [username, domain] = original.split('@');
    const maskedUsername = username.substring(0, 2) + '*'.repeat(username.length - 2);
    return `${maskedUsername}@${domain}`;
}

// Generate JSON data
function generateJSON() {
    return JSON.stringify({
        userId: faker.string.uuid(),
        preferences: {
            theme: faker.helpers.arrayElement(['dark', 'light']),
            language: faker.helpers.arrayElement(['en', 'hi', 'ta'])
        },
        lastLogin: faker.date.recent().toISOString()
    });
}

// Generate binary data (hex representation)
function generateBinary() {
    return faker.string.hexadecimal({ length: 32, prefix: '0x' });
}

// Generate address
function generateAddress() {
    return `${faker.location.streetAddress()}, ${faker.location.city()}, ${faker.location.state()}, ${faker.location.zipCode()}`;
}

// Main generator function
function generatePIIData(type) {
    switch (type) {
        case PII_TYPES.PAN_CARD:
            return generatePAN();
        case PII_TYPES.GST_NUMBER:
            return generateGST();
        case PII_TYPES.DOB:
            return faker.date.birthdate({ min: 18, max: 80, mode: 'age' }).toISOString().split('T')[0];
        case PII_TYPES.MOBILE_NUMBER:
            return generateMobileNumber();
        case PII_TYPES.PIN_CODE:
            return generatePinCode();
        case PII_TYPES.MASK:
            return generateMask();
        case PII_TYPES.PASSPORT_NUMBER:
            return generatePassport();
        case PII_TYPES.NAME:
            const fullFirstName = generateDiverseFirstName();
            const fullLastName = generateDiverseLastName();
            return faker.datatype.boolean(0.3) ?
                `${fullFirstName} ${generateDiverseMiddleName()} ${fullLastName}` :
                `${fullFirstName} ${fullLastName}`;
        case PII_TYPES.FIRST_NAME:
            return generateDiverseFirstName();
        case PII_TYPES.LAST_NAME:
            return generateDiverseLastName();
        case PII_TYPES.ADDRESS:
            return generateAddress();
        case PII_TYPES.JSON:
            return generateJSON();
        case PII_TYPES.OTHER:
            return faker.lorem.sentence();
        case PII_TYPES.BINARY:
            return generateBinary();
        case PII_TYPES.EMAIL:
            return faker.internet.email();
        default:
            return faker.lorem.word();
    }
}

// Generate token
function generateToken() {
    const prefix = 'TKN_';
    const randomPart = faker.string.alphanumeric({ length: 12, casing: 'upper' });
    return `${prefix}${randomPart}`;
}

// Generate hash
function generateHash() {
    return crypto.randomBytes(16).toString('hex');
}

// Generate complete multi-field person record
function generatePersonRecord() {
    const firstName = generateDiverseFirstName();
    const lastName = generateDiverseLastName();
    const middleName = faker.datatype.boolean(0.3) ? generateDiverseMiddleName() : null; // 30% have middle name

    return {
        token: generateToken(),
        first_name: firstName,
        last_name: lastName,
        middle_name: middleName,
        full_name: middleName ? `${firstName} ${middleName} ${lastName}` : `${firstName} ${lastName}`,
        email: faker.internet.email({ firstName, lastName }),
        mobile_number: generateMobileNumber(),
        date_of_birth: faker.date.birthdate({ min: 18, max: 80, mode: 'age' }).toISOString().split('T')[0],
        address: generateAddress(),
        city: generateIndianCity(),
        country: 'India',
        pan_card: faker.datatype.boolean(0.4) ? generatePAN() : null, // 40% have PAN
        passport_number: faker.datatype.boolean(0.2) ? generatePassport() : null, // 20% have passport
        is_active: faker.datatype.boolean(),
        created_by: faker.helpers.arrayElement(['admin', 'system', 'user', 'api', 'batch_job']),
        modified_by: faker.helpers.arrayElement(['admin', 'system', 'user', 'api', 'batch_job'])
    };
}

// Generate single PII record (legacy function - kept for compatibility)
function generatePIIRecord() {
    const piiTypes = Object.values(PII_TYPES);
    const selectedType = faker.helpers.arrayElement(piiTypes);
    const piiData = generatePIIData(selectedType);

    return {
        data_type: selectedType,
        pii_data_point: piiData,
        token: generateToken(),
        is_active: faker.datatype.boolean(),
        hash: generateHash(),
        created_by: faker.helpers.arrayElement(['admin', 'system', 'user', 'api', 'batch_job']),
        modified_by: faker.helpers.arrayElement(['admin', 'system', 'user', 'api', 'batch_job'])
    };
}

// Generate multi-field person data as separate CSV records (one per field)
function generateMultiFieldCSV(numberOfPersons = 1000) {
    console.log(`Generating multi-field data for ${numberOfPersons} persons as separate records...`);

    // CSV header - Same structure as original single-field format
    let csvContent = 'data_type,pii_data_point,token,is_active,hash,created_by,modified_by\n';

    // Progress tracking
    const progressInterval = Math.max(1, Math.floor(numberOfPersons / 50));
    let totalRecords = 0;

    for (let i = 0; i < numberOfPersons; i++) {
        const person = generatePersonRecord();
        const baseToken = person.token;

        // Create separate records for each field
        const fieldsToProcess = [
            { type: 'FIRST_NAME', value: person.first_name },
            { type: 'LAST_NAME', value: person.last_name },
            { type: 'EMAIL', value: person.email },
            { type: 'MOBILE_NUMBER', value: person.mobile_number },
            { type: 'DATE_OF_BIRTH', value: person.date_of_birth },
            { type: 'ADDRESS', value: person.address },
            { type: 'CITY', value: person.city },
            { type: 'COUNTRY', value: person.country }
        ];

        // Add optional fields if they exist
        if (person.middle_name) {
            fieldsToProcess.push({ type: 'MIDDLE_NAME', value: person.middle_name });
        }
        if (person.pan_card) {
            fieldsToProcess.push({ type: 'PAN_CARD', value: person.pan_card });
        }
        if (person.passport_number) {
            fieldsToProcess.push({ type: 'PASSPORT_NUMBER', value: person.passport_number });
        }

        // Create a CSV record for each field
        fieldsToProcess.forEach((field, fieldIndex) => {
            if (field.value && field.value.trim()) {
                const fieldToken = `${baseToken}_${field.type}`;
                const escapedValues = [
                    field.type,
                    `"${field.value.replace(/"/g, '""')}"`,
                    fieldToken,
                    person.is_active,
                    generateHash(),
                    person.created_by,
                    person.modified_by
                ];

                csvContent += escapedValues.join(',') + '\n';
                totalRecords++;
            }
        });

        // Progress update
        if ((i + 1) % progressInterval === 0) {
            console.log(`Generated person ${i + 1}/${numberOfPersons} (${totalRecords} total field records)`);
        }
    }

    console.log(`✅ Generated ${totalRecords} individual field records from ${numberOfPersons} persons`);

    return csvContent;
}

// Generate legacy single-field CSV content (for backward compatibility)
function generateCSV(numberOfRecords = 10000) {
    console.log(`Generating ${numberOfRecords} PII records...`);

    // CSV header - Step 1: Plaintext PII data ready for Vault encryption
    let csvContent = 'data_type,pii_data_point,token,is_active,hash,created_by,modified_by\n';

    // Progress tracking
    const progressInterval = Math.max(1, Math.floor(numberOfRecords / 100));

    for (let i = 0; i < numberOfRecords; i++) {
        const record = generatePIIRecord();

        // Escape CSV values (wrap in quotes if they contain commas, quotes, or newlines)
        const escapedValues = [
            record.data_type,
            `"${record.pii_data_point.replace(/"/g, '""')}"`,
            record.token,
            record.is_active,
            record.hash,
            record.created_by,
            record.modified_by
        ];

        csvContent += escapedValues.join(',') + '\n';

        // Progress update
        if ((i + 1) % progressInterval === 0) {
            console.log(`Generated ${i + 1}/${numberOfRecords} records (${Math.round(((i + 1) / numberOfRecords) * 100)}%)`);
        }
    }

    return csvContent;
}

// Main execution
async function main() {
    console.log('📋 STEP 1: PII Data Generator (Plaintext)');
    console.log('=========================================');

    const args = process.argv.slice(2);
    let numberOfPeople = NumberOfPeople;  // Typically 1000 people (generates ~8000 records in DB)
    let outputFile = 'resources/generated_pii_data.csv';

    // Parse command line arguments
    if (args.includes('--help')) {
        console.log(`
Usage: node pii-data-generator.js [options]

Options:
  --people <number>     Number of people to generate (default: 1000)
  --records <number>    Alias for --people (for backward compatibility)
  --output <filename>   Output CSV filename (default: generated_pii_data.csv)
  --multi-field        Generate multi-field person records (default)
  --single-field       Generate legacy single-field PII records
  --help               Show this help message

Multi-Field Mode (default):
  - Input: Number of people (e.g., 1000 people)
  - Output: Multiple CSV records per person (~8-11 records per person)
  - Fields: FIRST_NAME, LAST_NAME, EMAIL, MOBILE_NUMBER, ADDRESS, etc.
  - Example: 1000 people → ~8000 total CSV records

Single-Field Mode (legacy):
  - Input: Number of individual records
  - Output: One random PII field per CSV record
  - JSON: JSON formatted data
  - OTHER: Miscellaneous PII data
  - BINARY: Binary data (hex format)
  - EMAIL: Email addresses

Example:
  node pii-data-generator.js --records 5000 --output test_data.csv
        `);
        return;
    }

    // Parse number of people (or records for backward compatibility)
    const peopleIndex = args.indexOf('--people');
    const recordsIndex = args.indexOf('--records'); // backward compatibility

    if (peopleIndex !== -1 && args[peopleIndex + 1]) {
        numberOfPeople = parseInt(args[peopleIndex + 1]);
    } else if (recordsIndex !== -1 && args[recordsIndex + 1]) {
        numberOfPeople = parseInt(args[recordsIndex + 1]);
    }

    if (isNaN(numberOfPeople) || numberOfPeople <= 0) {
        console.error('Error: Invalid number of people specified');
        return;
    }

    // Parse output filename
    const outputIndex = args.indexOf('--output');
    if (outputIndex !== -1 && args[outputIndex + 1]) {
        outputFile = args[outputIndex + 1];
    }

    // Determine generation mode
    const useMultiField = !args.includes('--single-field'); // Default to multi-field
    const mode = useMultiField ? 'multi-field person records (as separate CSV rows)' : 'single-field PII';

    try {
        console.log(`Generating ${mode} to ${outputFile}...`);
        const startTime = Date.now();

        // Use appropriate generation function
        const csvContent = useMultiField ?
            generateMultiFieldCSV(numberOfPeople) :  // numberOfPeople = number of persons for multi-field
            generateCSV(numberOfPeople);             // numberOfPeople = number of records for single-field

        // Ensure resources directory exists
        const dir = outputFile.includes('/') ? outputFile.substring(0, outputFile.lastIndexOf('/')) : '';
        if (dir && !fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        fs.writeFileSync(outputFile, csvContent);

        const endTime = Date.now();
        const duration = ((endTime - startTime) / 1000).toFixed(2);

        if (useMultiField) {
            // Count actual records in the CSV for multi-field mode
            const recordCount = (csvContent.match(/\n/g) || []).length - 1; // subtract header
            console.log(`\n✅ Successfully generated data for ${numberOfPeople} people!`);
            console.log(`📄 Total CSV records created: ${recordCount} (average ${Math.round(recordCount/numberOfPeople)} fields per person)`);
        } else {
            console.log(`\n✅ Successfully generated ${numberOfPeople} ${mode}!`);
        }

        console.log(`📁 File: ${outputFile}`);
        console.log(`⏱️  Time taken: ${duration} seconds`);
        console.log(`📊 File size: ${(fs.statSync(outputFile).size / 1024 / 1024).toFixed(2)} MB`);

        // Show sample data
        console.log('\n📋 Sample records generated:');
        const sampleRecords = [];
        for (let i = 0; i < 3; i++) {
            sampleRecords.push(useMultiField ? generatePersonRecord() : generatePIIRecord());
        }
        console.table(sampleRecords);

    } catch (error) {
        console.error('❌ Error generating PII data:', error);
        process.exit(1);
    }
}

// Handle errors
process.on('unhandledRejection', (error) => {
    console.error('Unhandled rejection:', error);
    process.exit(1);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
    process.exit(1);
});

// Export for testing
module.exports = {
    generatePIIData,
    generatePIIRecord,
    PII_TYPES
};

// Run if called directly
if (require.main === module) {
    main().catch(console.error);
}