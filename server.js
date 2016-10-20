var express = require('express');
var Search = require('bing.search');
var search = new Search(process.env.BING_API_KEY);

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


app.get('/', (req, res) => {
    res.end("Access the api with a search query in the url for images you with to find:\n\n" +
            " ie. http://thissite/api/imagesearch/lolcats?offset=6\n\n" +
            "Or check the search query history with the following url:\n\n" +
            " ie. http://thissite/api/imagesearchhistory/");
});

app.get('/api/imagesearch/:query', (req, res) => {
    var searchQuery = req.params.query;
    var queryResults = [];
    console.log("GET imagesearch triggered.");
    
    search.images(
        searchQuery,
        {"skip": req.params.offset || 0},
        (err, results) => {
            if (err) {
                console.log(err);
                return res.status(500).end();
            }
            console.log("BING RESULTS:\n\n", results);
            results.forEach(item => {
                queryResults.push({
                    "url": item.sourceUrl,
                    "context": item.displayUrl,
                    "description": item.title
                });
            });
            collection(collectionName).findOne({
                "query": searchQuery
            }, (err, data) => {
                if (err) return res.status(500).end();
                if (data) {
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
            res.json(queryResults);
        });
});

app.get('/api/imagesearchhistory', (req, res) => {
    collection(collectionName).find(
        {},
        (err, results) => {
            if (err) res.status(500).end("Server Error");
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
