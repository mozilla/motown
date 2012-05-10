/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */


var
logger = require('winston'),
redis = require('../../../lib/redis');


function pop(q, res, stories){
  console.log(q);
  redis.rpop(q, function(err, data){
    if (data == null){
      res.json(stories);
    }
    else{
      stories.push(JSON.parse(data));
      pop(q, res, stories);
    }
  });
}

exports.index = function(req, res){
  var q = req.user.email + ":stories";
  pop(q, res, []);
};
