import tensorflow as tf


def get_targets_to_inputs_mapping(input_column_names, target_column_names):
    """
    The targets must be subset of the inputs. This computes the mapping from the target features to the input features. Its length is the same as the number of target features and for each feature, the index to the input features vector is computed.

    Parameters
    ----------
    input_column_names : list[str]
    target_column_names : list[str]

    Returns
    -------
    list of int
        `targets_indices_in_inputs` for `ResidualWrapper`
    """
    mapping = []
    for target in target_column_names:
        index = input_column_names.index(target)
        mapping.append(index)
    return mapping


def wrap_with_residual_connection(model, targets_to_inputs_mapping):
    """
    Alters the `model`'s `call` method to compute the output by adding the model's output to the input.
    By doing that, the layers of the model don't compute the absolute values of the output but rather the
    difference to the inputs.

    The target columns must be a subset of the input columns.

    Inspired by https://www.tensorflow.org/tutorials/structured_data/time_series#advanced_residual_connections

    Parameters
    ----------
    model : tf.keras.Model

    targets_to_inputs_mapping : list of int or tf.Tensor
        The mapping of the target columns to the input columns. Use `get_targets_to_inputs_mapping` to compute it.
    """

    targets_to_inputs_mapping = tf.convert_to_tensor(targets_to_inputs_mapping)
    orig_call = model.call

    def new_call(inputs, *args, **kwargs):
        # get the last time step values
        input_last_step = inputs[:, -1:, :]
        input_last_step = tf.gather(input_last_step, targets_to_inputs_mapping, axis=2)

        delta = orig_call(inputs, *args, **kwargs)  # output of the "inner" model
        # The prediction is the last input plus the delta calculated by the model.
        return input_last_step + delta  # the time dimension (axis 1) is broadcast to match the shape of delta

    model.call = new_call
    return model
