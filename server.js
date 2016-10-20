var express = require('express');
var https = require('https');
var urllib = require('url');

var app = express();
var port = process.env.PORT || 8080;

var MongoClient = require('mongodb').MongoClient; // save as 4 char base64 url safe string
var url = process.env.MONGODB_URL;
var collectionName = "searches";

//var urlRegex = /^(http(s)?:\/\/.)?(www\.)?[-a-zA-Z0-9@:%._\+~#=]{2,256}\.[a-z]{2,6}\b([-a-zA-Z0-9@:%_\+.~#?&//=]*)$/;

var db;

// Use connect method to connect to the Server
MongoClient.connect(url, function(err, mongodb) {
  if (err) throw err;
  console.log("Connected correctly to server");
  db = mongodb;
});

var collection = function( name ) {
  return db.collection( name );
};

var getImages = function (apiKey, searchQuery, offset, cb) {
    offset = offset || 0;
    https.get({
      host: 'api.cognitive.microsoft.com',
      path: '/bing/v5.0/images/search?q=' + encodeURIComponent(searchQuery) + "&offset=" + offset.toString(),
      headers: {"Ocp-Apim-Subscription-Key": apiKey}
    }, getResponse => {
        //console.log("API got response code", getResponse.statusCode);
        
        var results = "";
        getResponse.on('data', data => {
            results += data.toString();
        });
        getResponse.on('error', err => {
            return cb(err);
        });
        getResponse.on('end', () => {
            //console.log("Received reply of " + results.length + " bytes long.");
            var resultsObj = JSON.parse(results);
            var queryResults = [];
            resultsObj.value.forEach(item => {
                queryResults.push({
                    "url": urllib.parse(item.contentUrl, true).query.r,
                    "context": urllib.parse(item.hostPageUrl, true).query.r,
                    "description": item.name
                });
            });
            return cb(null, queryResults);
        });
    });
};

app.get('/', (req, res) => {
    res.end("Access the api with a search query in the url for images you with to find:\n\n" +
            " ie. http://thissite/api/imagesearch/lolcats?offset=6\n\n" +
            "Or check the search query history with the following url:\n\n" +
            " ie. http://thissite/api/imagesearchhistory/");
});

app.get('/api/imagesearch/:query', (req, res) => {
    var searchQuery = req.params.query;
    var offsetValue = (req.query.offset * 50) || 0; // pages are 50 items long, so offset is pages.
    console.log("GET imagesearch triggered: ", searchQuery, "offset:", offsetValue);
    
    getImages(
        process.env.BING_API_KEY,
        searchQuery,
        offsetValue,
        (err, results) => {
            if (err) {
                console.log(err);
                return res.status(500).end();
            }
            console.log("BING RESULTS:\n\n", results);
            collection(collectionName).findOne({
                "query": searchQuery
            }, (err, data) => {
                if (err) return res.status(500).end();
                if (data) {
                    console.log("Found data. Updating...");
                    collection(collectionName).update({
                        "query": data.query
                    },
                    {
                        $set: { "count": data.count + 1 },
                        $currentDate: { "lastModified": true }
                    },
                    (err, updateresults) => {
                        if (err) console.log(err);
                        console.log("Updated Search history.");
                    });
                } else {
                    collection(collectionName).insert({
                        "query": searchQuery,
                        "count": 1,
                        "lastModified": new Date()
                    },
                    (err, insertresults) => {
                        if (err) console.log(err);
                        console.log("Inserted Search history.");
                    });
                }
            });
            res.json(results);
        });
});

app.get('/api/imagesearchhistory', (req, res) => {
    collection(collectionName).find().toArray(
        (err, results) => {
            if (err) res.status(500).end("Server Error");
            console.log(results);
            res.json(results);
        }
    );
});

app.get('/*', (req, res) => {
    res.json({"error":"Where are you going?"});
});

app.listen(port, () => {
    console.log("Listening on " + port);
});
