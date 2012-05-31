#!/usr/local/bin/node

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */



// Module dependencies.
const 
redis   = require('../lib/redis')(),
logger  = require('../lib/logger'),
config  = require('../lib/configuration'),
mysql   = require('mysql').createClient(config.get('mysql'));


redis.debug_mode = false;

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
  // This is a blocking call only to the network layer (we keep ticking)
  redis.brpop('serializer:stories', 0, function(err, data){
    // data == ['stories', '{story json as string}']

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

    for (var i in userIds){
      var userId = userIds[i];

      // Persist the story to MySQL
      mysql.query(
        'REPLACE INTO stories SET id = ?, data = ?, user_id = ?, published_at = ?', [story.id, JSON.stringify(story), userId, story.pubdate],
        function(err, data){
          // TODO: Handle error wisely 
          if (err)
            logger.error(err);

          // Publish the story data as a pub/sub event for the socket if it's a new record
          if (data.affectedRows == 1){
            redis.publish('feeds.storyForUser', JSON.stringify({'userId': userId, 'story': story}), function(err){
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

redis.on("ready", function(){
  logger.info("Serializer ready.");
  waitForStory();
});