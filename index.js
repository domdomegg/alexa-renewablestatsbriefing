'use strict';

const https = require('https');
const parseXml = require('xml2js').parseString;

// Gets XML data from a HTTPS source.
function getXML(url, callback) {
    let req = https.get(url, (res) => {
        let data = '';

        res.on('data', (chunk) => {
            data += chunk;
        });

        res.on('end', () => {
            parseXml(data, function(err, result) {
                callback(result);
            });
        });
    }).on('error', (err) => {
        console.error('Error getting data: ', err);
    });
}

// Generates UUIDs
function generateUUID() {
    let i, j;
    let result = 'urn:uuid:';
    for (j = 0; j < 32; j++) {
        if (j == 8 || j == 12 || j == 16 || j == 20) {
            result = result + '-';
        }
        i = Math.floor(Math.random() * 16).toString(16).toUpperCase();
        result = result + i;
    }
    return result;
}

exports.handler = function(event, context, callback) {
    // Get data from elexon portal API
    getXML('https://downloads.elexonportal.co.uk/fuel/download/latest?key=' + process.env.ELEXON_API_KEY, (data) => {
        let fuels = {};
        data.GENERATION_BY_FUEL_TYPE_TABLE.INST[0].FUEL.forEach((f) => {
            fuels[f.$.TYPE] = parseInt([f.$.VAL]);
        });

        // Can't just add up percentages as there's pumped storage and interconnectors
        // Also solar isn't taken into account as it's mostly home installations
        // so only acts as a decrease in demand. Wind also has another 30% of
        // demand offseting generation.
        let fossilfuels = fuels.CCGT + fuels.OCGT + fuels.OIL + fuels.COAL;
        let renewables = fuels.NUCLEAR + fuels.WIND + fuels.NPSHYD + fuels.OTHER;

        let percentage = Math.round((renewables / (fossilfuels + renewables)) * 100);

        let date = new Date(data.GENERATION_BY_FUEL_TYPE_TABLE.INST[0].$.AT);

        // Return data for API Gateway
        callback(null, {
            statusCode: '200',
            body: JSON.stringify({
                uid: generateUUID(),
                updateDate: date.toISOString(),
                titleText: "Renewables statistics",
                mainText: "Currently, renewables make up " + percentage + "% of the UK\'s electricity supply.",
                redirectionUrl: "https://www.bmreports.com/bmrs/?q=generation/fueltype"
            }),
            headers: {
                'Content-Type': 'application/json'
            }
        });
    });
};
