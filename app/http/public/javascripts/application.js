/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

var DATA = {
  profile: {},
}

$(function(){
  $("#browserid").click(function(){
    navigator.id.getVerifiedEmail(function(assertion) {
      if (assertion) {
        $("input").val(assertion);
        $("form").submit();
      } else {
        location.reload();
      }
    });    
  });

  // Add a class to body tag for css rules
  var controller = $.grep(document.location.pathname.split("\/"), function(n){
      return(n);
  })[0];

  $('body').addClass(controller);
  $('ul.nav li.' + controller).addClass('active');

  // Page-specific stuff:
  switch(document.location.pathname){
    case '/profile':
      var updateLastSaved = function(){
        $('#changes_saved').text("Changes last saved at " + $.format.date(new Date(), 'hh:mm:ssa'));
        $('#changes_saved').show();
      };

      var saveUser = function(){
        $.ajax({
          url: '/profile',
          type: 'PUT',
          data: $('#user_form').serialize(),
          success: updateLastSaved
        });
      };

      var postNick = function(){
        if ($('#source_from_irc').is(':checked')){
          $('#user_real_name').attr('placeholder', 'Loading from irc.mozilla.org');
        }
        $.ajax({
          url: "/profile/nick", 
          data: $("#user_form").serialize(), 
          success: function(data){
            $('#error_contacting_nickserv').hide();
            updateLastSaved();
            DATA.profile['realNameFromIRC'] = data['realName'];
            $('#user_real_name').attr('placeholder', 'Real Name');

            if ($('#source_from_irc').is(':checked')){
              $('#user_real_name').val(data['realName']);
            }

            var ul = $('#networks ul');
            ul.empty();
            for(var i in data.networks){
              var network = data.networks[i];
              ul.append("<li>" + network  + "</li>");
            }
            $('#networks').show();
          },
          error: function(err){
            $('#error_contacting_nickserv').show();
            console.log(err);
            console.log("error contacting nickserv");
          },
          type: 'POST'
        });

        return false;
      };

      $('#source_from_irc').change(function(){
        if ($('#source_from_irc').is(':checked')){
          if (DATA.profile.realNameFromIRC){
            $('#user_real_name').val(DATA.profile.realNameFromIRC);
          }
          else{
            postNick();
          }
          $('#user_real_name').attr('disabled', true);
        }
        else{
          $('#user_real_name').attr('disabled', false);
        }
      });
      $('#user_real_name').change(function(){
        saveUser();
      });
      $('#user_nick').change(postNick);
        
      break;
  }
  
});