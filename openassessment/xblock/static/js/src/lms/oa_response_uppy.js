/**
 Interface for response (submission) view when using TransloadIt backend
 (uses Uppy uploader widget).

 Args:
 element (DOM element): The DOM element representing the XBlock.
 server (OpenAssessment.Server): The interface to the XBlock server.
 fileUploader (OpenAssessment.FileUploader): File uploader instance.
 baseView (OpenAssessment.BaseView): Container view.
 data (Object): The data object passed from XBlock backend.

 Returns:
 OpenAssessment.UppyResponseView
 **/

const UPPY_JS_URL =  "https://transloadit.edgly.net/releases/uppy/v0.28.0/dist/uppy.min.js"
const BUTTON_SELECTOR_PREFIX = "submission_answer_upload_"

OpenAssessment.UppyResponseView = function(element, server, fileUploader, baseView, data) {
    //TODO: figure out how to properly extend OpenAssessment.ResponseView
    // OpenAssessment.ResponseView(element, server, fileUploader, baseView, data);
    this.element = element;
    this.server = server;
    this.fileUploader = fileUploader;
    this.baseView = baseView;
    this.savedResponse = [];
    this.textResponse = 'required';
    this.fileUploadResponse = '';
    this.files = null;
    this.filesDescriptions = [];
    this.filesType = null;
    this.lastChangeTime = Date.now();
    this.errorOnLastSave = false;
    this.autoSaveTimerId = null;
    this.data = data;
    this.filesUploaded = false;
    this.announceStatus = false;
    this.isRendering = false;
    this.dateFactory = new OpenAssessment.DateTimeFactory(this.element);
}

OpenAssessment.UppyResponseView.prototype = $.extend({}, OpenAssessment.ResponseView.prototype, {

    // Maximum size (10 MB) for all attached files.
    MAX_FILES_SIZE: 10485760,  //set later to 256Mb or from XBlock settings

    load: function(usageID) {
        
        var view = this;
        var stepID = '.step--response';
        var focusID = "[id='oa_response_" + usageID + "']";

        view.isRendering = true;
        this.server.render('submission').done(
            function(html) {
                // Load the HTML and install event handlers
                $(stepID, view.element).replaceWith(html);
                view.server.renderLatex($(stepID, view.element));
                view.installHandlers();
                view.setAutoSaveEnabled(true);
                view.isRendering = false;
                view.baseView.announceStatusChangeToSRandFocus(stepID, usageID, false, view, focusID);
                view.announceStatus = false;
                view.dateFactory.apply();

                view.initUppy();
            }
        ).fail(function() {
            view.baseView.showLoadError('response');
        });

    },

    getAllowedFileTypes: function(usageID) {
        file_upload_type = $('#'+CSS.escape(BUTTON_SELECTOR_PREFIX+usageID)).data('upload-type');
        if (file_upload_type === undefined) return null;
        switch (file_upload_type) {
          case "image":
            return {
              "file_types": this.data.ALLOWED_IMAGE_MIME_TYPES,
              "types_msg": gettext("You can upload files with these file types: ") + "GIF, JPG, PJPG, PNG"
            }
            break;
          case "pdf-and-image":
            return {
              "file_types": this.data.ALLOWED_FILE_MIME_TYPES,
              "types_msg": gettext("You can upload files with these file types: ") + "GIF, JPG, PJPG, PNG, PDF"
            }
            break;
          case "custom":
            return {
              "file_types": this.data.FILE_TYPE_WHITE_LIST,
              "types_msg": gettext("You can upload files with these file types: ") + this.data.FILE_TYPE_WHITE_LIST.join(", ")
            }
            break;
        }

    },


    initUppy: function() {

        var el = this.element;
        var usageID = el.dataset.usageId;
        var courseID = el.dataset.courseId;
        var userID = $('#'+CSS.escape(BUTTON_SELECTOR_PREFIX+usageID)).data('userId');
        var max_size_friendly = this.MAX_FILES_SIZE/1024/1024 + gettext("MB");
        var view = this;
        var allowed_file_types = this.getAllowedFileTypes(usageID);
        if (!allowed_file_types) return false; // can't upload or already submitted, don't load Uppy

        // remove default handler for upload files button
        $('#'+CSS.escape(BUTTON_SELECTOR_PREFIX+usageID)).unbind('click');  

        //set up Uppy uploader
        RequireJS.require([UPPY_JS_URL], function() {


          var prepareFileForUpload = function(currentFile, files) {
            uppy.setState({uploadProceed: false});
            return checkUploadTotalFileSize(currentFile, files);
          }

          var checkUploadTotalFileSize = function(currentFile, files) {            
            var max_files_size = view.MAX_FILES_SIZE;
            var TotalFileSize = 0;

            for (var key in files) {
              TotalFileSize = TotalFileSize + files[key].size;
            }

            var grandTotalFileSize = currentFile.data.size + TotalFileSize;

            if (grandTotalFileSize > max_files_size) {
              uppy.info(gettext('Skipping file because you have exceeded maximum total upload size of')+' '+max_files_size+' '+gettext('bytes'), 'error', 2000);
              return false;
            }

            return true;
          }

          // confirm all files have descriptions set
          var confirmUpload = function(files) {
            if (uppy.getState().uploadProceed === true) {
              return true;
            }
            for (var key in files) {
              if (files[key].meta.description === undefined || files[key].meta.description == '' ) {
                uppy.info(gettext("You must enter a description for all uploaded files.  Click 'Enter File Description' below the file thumbnail for ")+files[key].name, 'warning', 5000 );
                return false;
              }
            }
            if (view.filesDescriptions) {
              uppy.info("First deleting any previously uploaded files.", "info", 2500);
            }

            removeUploadedFiles(files).then(
                function() {
                  // rename multiple files to have sequential numeric filenames
                  // but single file to have only the usage ID as file name
                  // this is due to how the s3 backend is designed
                  const updatedFiles = Object.assign({}, files);                  
                  const aryUpdated = Object.keys(updatedFiles);
                  var i = 0;
                  for (var k in aryUpdated) { //folder of stored items...
                    if (i==0) {
                      updatedFiles[aryUpdated[k]].name = usageID; // stored as single item with usage id name
                    }
                    else {
                      updatedFiles[aryUpdated[k]].name = i; // stored as 1, 2... inside directory w/ usage id name
                    }
                    i++;
                  };
                  uppy.setState({uploadProceed: true});
                  uppy.upload(updatedFiles);
                },
                function() {
                  uppy.info(gettext("Could not delete previously uploaded files.  Press upload again to try again."), 'warning', 5000);
                  return false;
                }
            );

            return false; // once we've removed previous uploaded files we call upload()
          }

          /**
           * Sends request to server to remove all previously uploaded files.
          */
          var removeUploadedFiles = function(files) { //normally lives in oa_server.js
              var url = view.server.runtime.handlerUrl(view.element, 'remove_all_uploaded_files');
              return $.Deferred(function(defer) {
                  $.ajax({
                      type: "POST",
                      url: url,
                      data: JSON.stringify({}),
                      contentType: jsonContentType
                  }).done(function(data) {
                      if (data.success) { defer.resolve(); }
                      else { defer.rejectWith(view, [data.msg]); }
                  }).fail(function() {
                      defer.rejectWith(view, [gettext('Server error.')]);
                  });
              }).promise();
          }

          //Uppy here is global and this is Window
            uppy = Uppy.Core({
                id: 'uppy_'+CSS.escape(usageID),
                autoProceed: false,
                allowMultipleUploads: false,
                onBeforeFileAdded: (currentFile, files) => prepareFileForUpload(currentFile, files),
                onBeforeUpload:(files) => confirmUpload(files),
                debug: true,
                restrictions: {
                    maxNumberOfFiles: 20, //this needs to match submission_mixin.MAX_FILES_COUNT
                    minNumberOfFiles: 1,
                    allowedFileTypes: allowed_file_types.file_types
                }
            });          

            uppy.use(Uppy.Dashboard, { 
                inline: false,
                target: 'body',
                // trigger: '#'+CSS.escape(BUTTON_SELECTOR_PREFIX + usageID),
                note: allowed_file_types.types_msg +". "+gettext("The maximum total file size is ") + max_size_friendly + ". ",
                showProgressDetails: true,
                showLinkToFileUploadResult: true,
                closeModalOnClickOutside: false,
                closeAfterFinish: true,
                allowMultipleUploads: false,
                proudlyDisplayPoweredByUppy: false,
                metaFields: [
                  { id: 'description', name: gettext('Description (required)'), placeholder: '' }
                ],
                locale: {
                  strings: {
                     closeModal: 'Close Uploader',
                     dashboardWindowTitle: 'Uploader (Press escape to close)',
                     edit: 'Enter file description (required)',
                     editFile: 'Enter file description (required)'
                  }
                }

            });

            // manually bind Dashboard to click 
            $('#'+CSS.escape(BUTTON_SELECTOR_PREFIX+usageID)).bind('click', function(event) {
              event.preventDefault();
              $('.submission__answer__display__file', view.element).removeClass('is--hidden');
              var sel = $('.step--response', view.element);
              var previouslyUploadedFiles = sel.find('.submission__answer__file').length ? true : false;
              if (previouslyUploadedFiles) {
                var msg = gettext('After you upload new files all your previously uploaded files will be overwritten. Continue?');  // jscs:ignore maximumLineLength
                if (confirm(msg)) {
                  uppy.getPlugin('Dashboard').openModal();
                } else {                
                  $(event.target).prop('disabled', true);
                }
              } else {
                uppy.getPlugin('Dashboard').openModal();
              }
            });

            uppy.use(Uppy.Transloadit, {
              target: Uppy.Dashboard,
              params: {
                auth: {
                  // To avoid tampering use signatures:
                  // https://transloadit.com/docs/api/#authentication
                  key: '792eb390ec5111e8becf951567442607'
                },                
                template_id: '1bdbaf10f35211e8b9b94391a2fb87e1',
                fields: {
                    s3_prefix: view.data.FILE_UPLOAD_PREFIX,
                    user_id: userID,
                    course_id: courseID,
                    usage_id: usageID
                }
              },
              signature: null,
            });

            uppy.use(Uppy.Webcam, {
              target: Uppy.Dashboard,
              onBeforeSnapshot: () => Promise.resolve(),
              countdown: false,
              modes: [
                'video-audio',
                'video-only',
                'audio-only',
                'picture'
              ],
              mirror: true,
              facingMode: 'user',
              locale: {}
            });

            uppy.on('upload-success', (file, resp, uploadURL) => {
              var index = isNaN(file.name) ? 0 : file.name; 
              view.filesDescriptions[index] = file.meta.description;
              view.fileUrl(index);

              // Log an analytics event
              Logger.log(
                  "openassessment.upload_file",
                  {
                      fileName: file.name,
                      fileSize: file.size,
                      fileType: file.type
                  }
              );
            });

            uppy.on('complete', (result) => {
              var trigger = '#'+CSS.escape(BUTTON_SELECTOR_PREFIX + usageID);
              $(trigger).attr('disabled', 'disabled'); //only allowing one upload
              view.saveFilesDescriptions(view.filesDescriptions);
            })

        });

    }
});
