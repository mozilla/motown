#!/usr/bin/env node

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

require('../../lib/extensions/number');
 
var
logger  = require('../../lib/logger'),
config  = require('../../lib/configuration'),
https   = require('https'),
mysql   = require('mysql').createClient(config.get('mysql')),
redis   = require('../../lib/redis')();

var users = [];


function getHttpOptions(email){
  return {
    host: 'api-dev.bugzilla.mozilla.org',
    port: 443,
    path: "/latest/bug?email1=" +
          encodeURIComponent(email) + 
          "&emailassigned_to1=1" + 
          "&emailcc1=1" +
          "&emaillongdesc1=1" +
          "&emailqa_contact1=1" + 
          "&emailreporter1=1" + 
          "&emailtype1=exact" +
          "&include_fields=ref,summary,last_change_time,creation_time,id,status,creator",
    headers: {
      accepts: 'application/json'
    }
  }
}

function getUsers(callback){
  logger.verbose('Retrieving users for bugzilla polling...');
  mysql.query('SELECT id, email FROM users ORDER BY id DESC', function(err, result){
    if (err){
      logger.error("Error retrieving users for bugzilla: " + err);
    }
    for (var i in result){

      users.push({id: result[i].id, email: result[i].email});
    }
    if (typeof(callback) == 'function'){
      callback();
    }
  });
}



// {
//   "bugs":[
//     {
//       "ref":"https://api-dev.bugzilla.mozilla.org/latest/bug/756173",
//       "status":"NEW",
//       "last_change_time":"2012-06-08T18:11:51Z",
//       "summary":"XMLHttpRequest sandbox issues",
//       "id":756173,
//       "creation_time":"2012-05-17T18:24:45Z"
//     },
//     {
//       "ref":"https://api-dev.bugzilla.mozilla.org/latest/bug/746826",
//       "status":"ASSIGNED",
//       "last_change_time":"2012-06-15T23:21:33Z",
//       "summary":"WebPageMaker Security review",
//       "id":746826,
//       "creation_time":"2012-04-19T00:43:31Z"
//     },
//     ...

function createStory(user, bug){
  var people = []
  if (bug.creator)
    people = [bug.creator.real_name];

  console.log(bug);

  var story = {
    id: 'bugzilla:' + bug.id + ":" + bug.last_change_time,
    // TODO: Get email from bugzilla username (creator":{"real_name":"Shane Caraveo (:mixedpuppy)","name":"mixedpuppy"})
    people: people,
    title: bug.summary,
    href: "https://bugzilla.mozilla.org/show_bug.cgi?id=" + bug.id,
    pubdate: bug.last_change_time,
    durable: true
  };
  redis.lpush("serializer:stories", JSON.stringify({'userIds': [user.id], 'story': story}), function (err, reply) {
    if (err)
      logger.error("Error sending story to Redis:" + err);
  });
}

function pollBugzilla(){
  var user = users.shift();

  if (user){
    var req = https.get(getHttpOptions(user.email), function(resp){
      var data = [];
      resp.on('data', function(chunk){
        data.push(chunk);
      });
      resp.on('end', function(){
        var bugs = JSON.parse(data.join('')).bugs;
        for (var i in bugs){
          createStory(user, bugs[i]);
        }
      });
    }).on('error', function(e){
      logger.error('Error response received from Bugzilla: ' + e.toString());
    });
  }
  else{
    getUsers(pollBugzilla);
  }

  // It means we'll have padding of one, we probably don't need this, but meh.
  if (users.length <= 1){
    getUsers();
  }
}

// Populate the users and then 
getUsers(function(){
  // pollBugzilla();
  setInterval(pollBugzilla, (10).minutes);
});
