import boto
import copy
from datetime import datetime, timedelta
import hashlib
import hmac
import json
import logging

from django.conf import settings

from .base import BaseBackend
from .s3 import Backend as S3Backend
from ..exceptions import FileUploadInternalError
logger = logging.getLogger("openassessment.fileupload.api")


class Backend(S3Backend):

    def get_upload_url(self, key, content_type):
        """
        For TransloadIt backend, we just need the prefix, with the
        anonymized userid, the course id, and the xblock usage id.
        We will pass those as separate fields to the TransloadIt Uppy plugin
        We also need to generate an expiration dateteime for the POST 
        and sign/encrypt the POST with the signature key+expiration.
        """
        bucket_name, key_name = self._retrieve_parameters(key)
        try:
            conn = _connect_to_s3()
            upload_url = conn.generate_url(
                expires_in=self.UPLOAD_URL_TIMEOUT,
                method='PUT',
                bucket=bucket_name,
                key=key_name,
                headers={'Content-Length': '5242880', 'Content-Type': content_type}
            )
            return upload_url
        except Exception as ex:
            logger.exception(
                u"An internal exception occurred while generating an upload URL."
            )
            raise FileUploadInternalError(ex)

    def get_signed_params(self, key, secret, data):
        """
        return a TransloadIt signature value using TransloadIt key, secret, and expiry duration
        return params as JSON string including new auth expiry used for signature calculation
        """        
        # data like {'fields':{}, 'template_id':'', 'auth':{}, ...}
        data = copy.deepcopy(data or {})
        expiry = timedelta(seconds=60) + datetime.utcnow()
        data['auth'] = {
            'key': key,
            'expires': expiry.strftime("%Y/%m/%d %H:%M:%S+00:00")
        }
        json_data = json.dumps(data)
        signature = hmac.new(str(secret),
                        json_data.encode('utf-8'),
                        hashlib.sha1).hexdigest()

        return {'params': json_data,
                'signature': signature}


def _connect_to_s3():
    """Connect to s3

    Creates a connection to s3 for file URLs.

    """
    # Try to get the AWS credentials from settings if they are available
    # If not, these will default to `None`, and boto will try to use
    # environment vars or configuration files instead.
    aws_access_key_id = getattr(settings, 'AWS_ACCESS_KEY_ID', None)
    aws_secret_access_key = getattr(settings, 'AWS_SECRET_ACCESS_KEY', None)

    return boto.connect_s3(
        aws_access_key_id=aws_access_key_id,
        aws_secret_access_key=aws_secret_access_key
    )
