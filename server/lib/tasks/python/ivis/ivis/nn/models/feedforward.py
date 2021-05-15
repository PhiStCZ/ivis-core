import tensorflow as tf


def feedforward_model(training_parameters, input_shape, target_shape):
    """
    Feedforward neural network.

    Parameters
    ----------
    training_parameters : ivis.nn.FeedforwardTrainingParams
    input_shape : tuple
    target_shape : tuple

    Returns
    -------
    tf.keras.Model
    """
    hidden_layers = []
    if hasattr(training_parameters, "hidden_layers"):
        hidden_layers = training_parameters.hidden_layers

    inputs = tf.keras.layers.Input(shape=input_shape)
    layer = tf.keras.layers.Flatten()(inputs)

    for size in hidden_layers:
        layer = tf.keras.layers.Dense(size)(layer)
        layer = tf.keras.layers.ReLU()(layer)

    outputs = tf.keras.layers.Dense(tf.math.reduce_prod(target_shape))(layer)
    outputs = tf.keras.layers.Reshape(target_shape)(outputs)

    return tf.keras.Model(inputs=inputs, outputs=outputs)
