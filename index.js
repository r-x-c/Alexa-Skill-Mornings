var https = require('https')
var fs = require('fs');
var readline = require('readline');
var google = require('googleapis');
var googleAuth = require('google-auth-library');
var request = require('request');
var moment = require('moment')
var SCOPES = ['https://www.googleapis.com/auth/calendar.readonly'];
var TOKEN_DIR = (process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE) + '/.credentials/';
var TOKEN_PATH = TOKEN_DIR + 'calendar-nodejs-quickstart.json';
var winston = require('winston');
var logger = new (winston.Logger)({
    transports: [
        new (winston.transports.Console)({ json: false, timestamp: true }),
        new winston.transports.File({ filename: __dirname + '/debug.log', json: false })
    ],
    exceptionHandlers: [
        new (winston.transports.Console)({ json: false, timestamp: true }),
        new winston.transports.File({ filename: __dirname + '/exceptions.log', json: false })
    ],
    exitOnError: false
});
module.exports = logger;


exports.handler = (event, context) => {
    try {
        if (event.session.new) {
            // New Session
            logger.info("NEW SESSION")
        }
        switch (event.request.type) {
            case "LaunchRequest":
            // Launch Request
            logger.info(`LAUNCH REQUEST`)
            context.succeed(
              generateResponse(
                buildSpeechletResponse("Welcome to an Alexa Skill, this is running on a deployed lambda function", true),
                {}
                )
              )
            break;

            case "IntentRequest":
                // Intent Request
                logger.info(`INTENT REQUEST`)
                switch(event.request.intent.name) {
                    case "GetTravelTime":
                        context.succeed(
                            generateResponse(
                                runAlexaSkill(function(output) {
                                    buildSpeechletResponse(output),
                                    {}
                                })
                            )
                        )
                        break;
                    default:
                        throw "Invalid intent"
                }
                break;

            case "SessionEndedRequest":
                logger.info(`SESSION ENDED REQUEST`)
                break;

            default:
                context.fail(`INVALID REQUEST TYPE: ${event.request.type}`)
        }

    } catch(error) {
        context.fail(`Exception: ${error}`)
    }
}

// Helpers
buildSpeechletResponse = (outputText, shouldEndSession) => {
    return {
        outputSpeech: {
            type: "PlainText",
            text: outputText
        },
        shouldEndSession: shouldEndSession
    }
}

generateResponse = (speechletResponse, sessionAttributes) => {
    return {
        version: "1.0",
        sessionAttributes: sessionAttributes,
        response: speechletResponse
    }
}

// Load client secrets from a local file.
function runAlexaSkill(callbackResponse) {
    fs.readFile('client_secret.json', function processClientSecrets(err, content) {
        if (err) {
            logger.info('Error loading client secret file: ' + err);
            return;
        }
        // Authorize a client with the loaded credentials, then call the
        // Google Calendar API.
        logger.info('Initiated request');
        authorize(JSON.parse(content), processFirstEvent, function(returnVal) {
            callbackResponse(returnVal)
        })
    });

}


/**
 * Create an OAuth2 client with the given credentials, and then execute the
 * given callback function.
 *
 * @param {Object} credentials The authorization client credentials.
 * @param {function} callback The callback to call with the authorized client.
 */
function authorize(credentials, callback, callbackResponse) {
    var clientSecret = credentials.installed.client_secret;
    var clientId = credentials.installed.client_id;
    var redirectUrl = credentials.installed.redirect_uris[0];
    var auth = new googleAuth();
    var oauth2Client = new auth.OAuth2(clientId, clientSecret, redirectUrl);

    // Check if we have previously stored a token.
    fs.readFile(TOKEN_PATH, function(err, token) {
        if (err) {
            getNewToken(oauth2Client, callback);
        } else {
            oauth2Client.credentials = JSON.parse(token);
            callback(oauth2Client, callbackResponse);
        }
    });
}

/**
 * Get and store new token after prompting for user authorization, and then
 * execute the given callback with the authorized OAuth2 client.
 *
 * @param {google.auth.OAuth2} oauth2Client The OAuth2 client to get token for.
 * @param {getEventsCallback} callback The callback to call with the authorized
 *     client.
 */
function getNewToken(oauth2Client, callback) {
    var authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES
    });
    logger.info('Authorize this app by visiting this url: ', authUrl);
      var rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    rl.question('Enter the code from that page here: ', function(code) {
        rl.close();
        oauth2Client.getToken(code, function(err, token) {
            if (err) {
                logger.info('Error while trying to retrieve access token', err);
                return;
            }
            oauth2Client.credentials = token;
            storeToken(token);
            callback(oauth2Client);
        });
    });
}

/**
 * Store token to disk be used in later program executions.
 *
 * @param {Object} token The token to store to disk.
 */
function storeToken(token) {
    try {
        fs.mkdirSync(TOKEN_DIR);
    } catch (err) {
    if (err.code != 'EEXIST') {
      throw err;
    }
    }

    fs.writeFile(TOKEN_PATH, JSON.stringify(token));
    logger.info('Token stored to ' + TOKEN_PATH);
}

/**
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 */

function processFirstEvent(auth, callbackResponse) {
    var calendar = google.calendar('v3');
    calendar.events.list({
        auth: auth,
        calendarId: 'primary',
        timeMin: (new Date()).toISOString(),
        maxResults: 1,
        singleEvents: true,
        orderBy: 'startTime'
    }, function(err, response) {
        if (err) {
            logger.info('The API returned an error: ' + err);
            return;
    }
    var events = response.items;
    if (events.length == 0) {
        logger.info('No upcoming events found.')
    } else {
        var event = events[0];
        var start = event.start.dateTime || event.start.date;
        var eventStartTime = moment(event.start.dateTime, moment.ISO_8601);
        var totalMinutes = moment(eventStartTime).diff(moment(new Date(), moment.ISO_8601), 'minutes');
        getTravelTime(event.location, function(travelTime) {
            totalMinutes -= travelTime
            var hoursLeft = Math.floor(totalMinutes / 60);
            var minutesLeft = totalMinutes % 60;
            logger.info("%s minutes until first event", totalMinutes)
            if (hoursLeft > 0) {
                _ = node
                callbackResponse("You have to leave in " + hoursLeft + " hours and " + minutesLeft + " minutes")
            }
            else {
                callbackResponse("You have to leave in " + minutesLeft + " minutes")
            }
        });
    }
});
}

function getUserLocation(callback){
    request('https://ipinfo.io', function (error, response, body) {
        if (!error && response.statusCode === 200) {
            callback(JSON.parse(body).loc);
        }
    });
}

function encodeGeoLocation(address, callback) {
    var API_KEY = process.env.GOOGLE_API_KEY;
    var BASE_URL = "https://maps.googleapis.com/maps/api/geocode/json?address=";
    var url = BASE_URL + address + "&key=" + API_KEY;
    request(url, function (error, response, body) {
        if (!error && response.statusCode == 200) {
            callback(JSON.parse(body).results[0].geometry.location.lat + ',' + 
             JSON.parse(body).results[0].geometry.location.lng);
        }
        else {
            logger.error("encodeGeoLocation failed" + error)
        }
    });
};

function getTravelTime(destination, callback) {
    getUserLocation(function(currentLoc) {
        encodeGeoLocation(destination, function(destLoc) {
            var API_KEY = process.env.GOOGLE_API_KEY;
            var BASE_URL = "https://maps.googleapis.com/maps/api/directions/json?origin="
            var url = BASE_URL + currentLoc + '&destination=' + destLoc + '&key=' + API_KEY;
            request(url, function (error, response, body) {
                if (!error && response.statusCode === 200) {
                    var gmapData = JSON.parse(body);
                    var travelTime = gmapData.routes[0].legs[0].duration.text.match(/\d/g).join("");
                    logger.log('Google Maps API: %s minutes to arrive at %s', travelTime, destination)
                    callback(travelTime)
                }
            });

        });
    });
};
