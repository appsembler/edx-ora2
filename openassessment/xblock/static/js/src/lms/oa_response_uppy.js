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

const TRANSLOADIT_JS =  "https://transloadit.edgly.net/releases/uppy/v0.28.0/dist/uppy.min.js"

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

    initUppy: function() {

        usageID = this.element.dataset.usageId;

        //set up Uppy uploader
        RequireJS.require([TRANSLOADIT_JS], function() {
            var uppy = Uppy.Core({
                id: 'uppy', //this will need to be specific to one block id
                autoProceed: false,
                allowMultipleUploads: false,
                onBeforeFileAdded: (currentFile, files) => checkUpload(currentFile, files),
                debug: true,
                restrictions: {
                    //maxFileSize: 8388608, //=8Mb, 256Mb = 268435456,  just care about total upload
                    maxNumberOfFiles: 30, //set somewhat reasonable number here just to avoid abuse
                    minNumberOfFiles: 1,
                    allowedFileTypes: ['image/*', '.pdf', 'video/*'] //get these from XBlock settings
                }
            });

            uppy.use(Uppy.Dashboard, { 
                inline: false,
                target: 'body',
                trigger: '#'+CSS.escape('submission_answer_upload_'+usageID),
                note: "You may upload images (gif, png, jpg), videos, or PDFs. The maximum total file size is 256Mb.",
                showProgressDetails: true,
                showLinkToFileUploadResult: false,
                closeModalOnClickOutside: false,
                closeAfterFinish: false,
                allowMultipleUploads: false,
                proudlyDisplayPoweredByUppy: false

            })

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
                    user_id: "TransloadItTestUserId",
                    item_id: "TransloadItTestItemId",
                    course_id: "course-v1:Appsembler+BryanTest+TransloadItTest" 
                }
              },
              waitForEncoding: false,
              waitForMetadata: false,
              importFromUploadURLs: false,
              alwaysRunAssembly: false,
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
            })
        });    
    },

    /**
     * Check that "submit" button could be enabled (or disabled)
     *
     * Args:
     * filesFiledIsNotBlank (boolean): used to avoid race conditions situations
     * (if files were successfully uploaded and are not displayed yet but
     * after upload last file the submit button should be available to push)
     *
     */
    checkSubmissionAbility: function(filesFiledIsNotBlank) {
        //will need to see that uppy upload was successful
    },

    /**
     When selecting a file for upload, do some quick client-side validation
     to ensure that it is an image, a PDF or other allowed types, and is not
     larger than the maximum file size.

     Args:
     files (list): A collection of files used for upload. This function assumes
     there is only one file being uploaded at any time. This file must
     be less than 5 MB and an image, PDF or other allowed types.
     uploadType (string): uploaded file type allowed, could be none, image,
     file or custom.

     **/
    prepareUpload: function(files, uploadType, descriptions) {
        //most of this is now unnecessary but this is where we can 
        //set parameters for uppy

    },

    /**
     Manages file uploads for submission attachments.

     **/
    uploadFiles: function() {
        //this will need to work differently to remove uploaded files
        // and save file descriptions
    },

    /**
     Retrieves a one-time upload URL from the server, and uses it to upload images
     to a designated location.

     **/
    fileUpload: function(view, filetype, filename, filenum, file, finalUpload) {
        //this will use uppy instead
    },

    /**
     Set the file URL, or retrieve it.

     **/
    fileUrl: function(filenum) {
       

    }

});
