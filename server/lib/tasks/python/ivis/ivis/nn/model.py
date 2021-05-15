"""
Functions for creating NN models.
"""
import tensorflow as tf
from .ParamsClasses import FeedforwardTrainingParams
from .models.feedforward import feedforward_model
from .models.residual_wrapper import *


#################################################
# Create tf.keras.Model based on TrainingParams #
#################################################


def get_model(training_parameters, input_shape, target_shape):
    """
    Create new TensorFlow network model based on `training_parameters`.

    Parameters
    ----------
    training_parameters : ivis.nn.TrainingParams
    input_shape : tuple
    target_shape : tuple

    Returns
    -------
    tf.keras.Model
    """
    if training_parameters.architecture == "feedforward":
        return feedforward_model(FeedforwardTrainingParams(training_parameters), input_shape, target_shape)
    else:
        raise ValueError(f"Unknown network architecture: '{training_parameters.architecture}'")


################################################################
# Create tf.keras.optimizers.Optimizer based on TrainingParams #
################################################################


def get_optimizer(training_parameters):
    adam_params = {}
    if hasattr(training_parameters, "learning_rate") and isinstance(training_parameters.learning_rate, float):
        adam_params["learning_rate"] = training_parameters.learning_rate

    return tf.keras.optimizers.Adam(**adam_params)
