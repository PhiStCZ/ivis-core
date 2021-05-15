from .Params import Params


class TrainingParams(Params):
    """Class representing the parameters for `run_training` function."""

    def __init__(self):
        self.architecture = None     # the architecture of neural network
        self.learning_rate = 0.001   # learning rate for the training
        self.query = None            # the Elasticsearch query to get the desired data
        self.query_type = None       # type of the ES query ("docs" | "histogram")
        self.index = None            # the Elasticsearch index
        self.input_signals = []      # The input signals and their types
        self.target_signals = []     # The target signals and their types, keep empty for autoregressive models
        self.split = dict()          # Fractions of the dataset to use as training, validation and test datasets. Should sum up to 1.
        self.ts_field = None         # ES field of ts signal
        self.interval = None         # Aggregation interval in milliseconds.
        self.input_width = 0         # Number of time steps used for prediction.
        self.target_width = 0        # Number of predicted time steps.

    def __str__(self):
        return \
            "Training parameters" + "\n" + \
            "\nQuery:\n" + \
            str(self.query) + \
            "\nQuery type: " + str(self.query_type) + \
            "\nIndex: " + str(self.index) + \
            "\nInput signals:\n" + \
            str(self.input_signals) + \
            "\nTarget signals:\n" + \
            str(self.target_signals) + \
            "\nSplit:\n" + \
            str(self.split) + \
            "\n\nArchitecture: " + str(self.architecture)
