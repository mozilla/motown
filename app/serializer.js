#!/usr/local/bin/node

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */



// Module dependencies.
const 
redis    = require('../lib/redis').new(),
pubRedis = require('../lib/redis').pub,
logger   = require('../lib/logger'),
config   = require('../lib/configuration'),
mysql    = require('mysql').createClient(config.get('mysql'));

require('../lib/extensions/array');
require('../lib/extensions/number');

var watchedTokens = null; // {token: [<user.id>, ...], ...


function loadWatchedTokens(callback){
  mysql.query(
    "SELECT token, user_id FROM watched_tokens ORDER BY token, user_id",
    function(err, rows)
    {
      if (!err){
        watchedTokens = {};
        for (var i in rows){

          var token = "@" + rows[i].token;
          var userId = rows[i].user_id;

          if (token in watchedTokens){
            watchedTokens[token].push(userId);
          }
          else{
            watchedTokens[token] = [userId];
          }
        }
        if (typeof(callback) == 'function'){
          callback();
        }
      }
      else{
        logger.error("Error loading watched_tokens in Feed Daemon: " + err);
      }
    }
  );
}

// This method might not look super clear,
// but it is checking each token found in a story against the
// complete set of watched tokens. aka {token: [<user.id>, ...], ...}
// so we return a possibly non-unique list of interested users.
function checkForMentions(story){
  var mentionedUsers = [];

  var mentions = story.title.match(/\@\w+/g);

  for (var i in mentions){
    mentionedUsers = mentionedUsers.concat(watchedTokens[mentions[i]]);
  }

  return mentionedUsers;
}


// {
//     "userIds": [ 13, 14 ],
//     "story": {
//         "id": "tag:github.com,2008:IssuesEvent/1553175060",
//         "title": "jbonacci opened issue 1607 on mozilla/browserid",
//         "people": [
//             {
//                 "name": "jbonacci",
//                 "uri": "https://github.com/jbonacci"
//             }
//         ],
//         "href": "https://github.com/mozilla/browserid/issues/1607",
//         "pubdate": "2012-05-17T17:20:12Z",
//         "image": {
//             "title": "a photo of me (aka the alt)",
//             "url": "https://secure.gravatar.com/avatar/ef049ef74c1c0323b925195e7b7cc9e7?s=30&d=https://a248.e.akamai.net/assets.github.com%2Fimages%2Fgravatars%2Fgravatar-140.png"
//         }
//     }
// }

function waitForStory(){
  logger.debug('Waiting on serializer:stories');
  // This is a blocking call only to the network layer (we keep ticking)
  redis.brpop('serializer:stories', 0, function(err, data){

    if (err)
      logger.error("Error dequeueing story: " + err);

    //TODO: Error handling including:
    //      - accepting an error from redis
    //      - putting an item back on the queue
    //      - dealing with empty id
    //      - dealing with mysql errors

    // Unpack the story data and split to per-user.
    var data = data.pop();
    var story = JSON.parse(data);

    var userIds = story.userIds;

    story = story.story;

    var mentionedUsers = [];

    if (!story.durable){
      mentionedUsers = checkForMentions(story);
    }

    userIds = Array.uniqueSort(userIds.concat(mentionedUsers));

    for (var i in userIds){
      var userId = userIds[i];

      var durable = !!(story.durable || mentionedUsers.indexOf(userId) >= 0);
      logger.debug("Durable? : " + durable);

      // Persist the story to MySQL
      mysql.query(
        'REPLACE INTO stories SET id = ?, data = ?, user_id = ?, published_at = ?, durable = ?', [story.id, JSON.stringify(story), userId, story.pubdate, !!durable],
        function(err, data){
          // TODO: Handle error wisely 
          if (err)
            logger.error(err);

          // Publish the story data as a pub/sub event for the socket if it's a new record
          if (data.affectedRows == 1){
            if (durable){
              pubRedis.publish('notifications.mention.new', userId.toString(), function(err){
                if (err)
                  logger.error("Error publishing notifications.mention.new: " + err);
              });
            }

            // We always generate a new story for the sidebar
            pubRedis.publish('feeds.storyForUser', JSON.stringify({'userId': userId, 'story': story}), function(err){
              if (err)
                logger.error(err);
            });
          }
        }
      );
    }

    // Rinse and repeat
    process.nextTick(waitForStory);
  });
}


var reloadInterval = setInterval(loadWatchedTokens, (10).minutes());


redis.on("ready", function(){
  loadWatchedTokens(function(){
    logger.info("Serializer ready.");
    waitForStory();
  });
});
