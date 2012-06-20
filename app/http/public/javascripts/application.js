/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

var DATA = {
  profile: {}
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
    case '/feeds':
      $('.feeds #new_feed_form').click(function(){
        createBlankFeedForm();
        return false;
      });

      function deleteUrl(){
        var form = $(this).parent();

        if (!form.hasClass('verified') && !form.hasClass('error')){
          // This hasn't been serialized yet.
          form.parent().remove();
        }
        $.ajax({
          type: 'DELETE',
          url: '/feeds/feed',
          data: form.serialize(),
          success: function(){
            form.parent().remove();
          },
          error: function(){
            console.log("Error removing");
          }
        });
        console.log();
        return false;
      }

      $('.feeds form .delete').click(deleteUrl);

      function validateAndSaveUrl(){
        var form = $(this).parent();

        form
          .removeClass('verified')
          .removeClass('error')
          .find('.delete').hide();
        console.log(form.serialize());
        var reqData = form.serialize();

        form.find('input[type=hidden]').val($(this).val());

        $.ajax({
          type: 'POST',
          url: '/feeds/feed',
          data: reqData,
          success: function(data){
            console.log(data);
            if (data.url == ""){
              form.remove();
            }
            if (data.verified){
              form.addClass('verified');
              if($('input[name=url][value=]').length == 0){
                createBlankFeedForm();
              }
            }
            else{
              form.addClass('error');
            }
            form.find('.delete').show();
            form.find('input[type=text]').attr('title', data.title);
          },
          error: function(){
            //TODO: Do something intelligent in the UI.
            console.log("Error persisting element");
          }
        });
      }

      $('.feeds form input[name=url]').change(validateAndSaveUrl);

      // $('input[value="Whatever"]');
      var template = $('#feed_template');
      template.removeAttr('id').remove();

      function createBlankFeedForm(){
        var blankInput = $('.feeds input[type=text][value=]');

        if (blankInput.length > 1){
          blankInput.focus();
          return;
        }
        var newFeed = template.clone();
        newFeed.find('input[name=url]').change(validateAndSaveUrl);
        newFeed.find('.delete').click(deleteUrl);
        newFeed.find('form').submit(function(){
          return false;
        });
        $('ul.feeds').append(newFeed);
        newFeed.show();
      }

      createBlankFeedForm();

      break;
  }
  
});